from typing import Optional, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.document import ProcessedBill, ProcessedOrder, RawDocument
from app.schemas.document import (
    CorrectionCreate,
    DocumentTypeOverride,
    ProcessedBillOut,
    ProcessedOrderOut,
    RawDocumentOut,
    UploadResponse,
    LineOut,
    BillLineOut,
)
from app.services import document_service
from app.services.ocr_queue import enqueue, pending as queue_pending, worker_count

router = APIRouter(prefix="/documents", tags=["Documents"])


def _parse_session_id(session_id: Optional[str]):
    if not session_id:
        return None
    try:
        return UUID(session_id)
    except ValueError:
        return None


@router.post("/upload", response_model=UploadResponse)
def upload_document(
    file: UploadFile = File(...),
    session_id: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    content = file.file.read()
    file_path = document_service.save_uploaded_file(file.filename, content)
    raw = document_service.create_raw_document(db, file.filename, file_path, session_id=_parse_session_id(session_id))
    enqueue(raw.id)
    return UploadResponse(
        raw_document_id=raw.id,
        file_name=raw.file_name,
        ocr_status=raw.ocr_status,
        message="File uploaded. OCR processing started in background.",
    )


@router.post("/upload-batch")
def upload_batch(
    files: List[UploadFile] = File(...),
    session_id: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    parsed_sid = _parse_session_id(session_id)

    # Kiểm tra trùng tên file trong phiên
    duplicates = []
    if parsed_sid:
        incoming_names = [f.filename for f in files]
        existing = db.query(RawDocument.file_name).filter(
            RawDocument.session_id == parsed_sid,
            RawDocument.file_name.in_(incoming_names),
        ).all()
        duplicates = [row.file_name for row in existing]

    results = []
    for file in files:
        content = file.file.read()
        file_path = document_service.save_uploaded_file(file.filename, content)
        raw = document_service.create_raw_document(db, file.filename, file_path, session_id=parsed_sid)
        enqueue(raw.id)
        results.append({
            "raw_document_id": str(raw.id),
            "file_name": raw.file_name,
            "ocr_status": raw.ocr_status,
            "is_duplicate": raw.file_name in duplicates,
        })
    return {
        "uploaded": len(results),
        "queue_pending": queue_pending(),
        "duplicates": duplicates,
        "files": results,
    }


@router.get("/queue-status")
def get_queue_status():
    return {"queue_pending": queue_pending(), "workers": worker_count()}


@router.get("/raw", response_model=list[RawDocumentOut])
def list_raw_documents(skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    return db.query(RawDocument).order_by(RawDocument.upload_date.desc()).offset(skip).limit(limit).all()


@router.get("/raw/{raw_doc_id}", response_model=RawDocumentOut)
def get_raw_document(raw_doc_id: UUID, db: Session = Depends(get_db)):
    doc = db.query(RawDocument).filter(RawDocument.id == raw_doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.post("/raw/{raw_doc_id}/reprocess")
def reprocess_document(raw_doc_id: UUID, db: Session = Depends(get_db)):
    doc = db.query(RawDocument).filter(RawDocument.id == raw_doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    doc.ocr_status = "pending"
    db.commit()
    enqueue(raw_doc_id)
    return {"message": "Reprocessing started"}


@router.post("/raw/{raw_doc_id}/corrections")
def add_correction(
    raw_doc_id: UUID,
    body: CorrectionCreate,
    db: Session = Depends(get_db),
):
    correction = document_service.apply_correction(db, raw_doc_id, body.field_path, body.corrected_value)
    return {"id": str(correction.id), "field_path": correction.field_path}


@router.post("/raw/{raw_doc_id}/override-type")
def override_document_type(
    raw_doc_id: UUID,
    body: DocumentTypeOverride,
    db: Session = Depends(get_db),
):
    doc = db.query(RawDocument).filter(RawDocument.id == raw_doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if body.document_type not in ("purchase_order", "vendor_bill"):
        raise HTTPException(status_code=400, detail="Invalid document_type")
    doc.document_type = body.document_type
    db.commit()
    return {"message": "Document type updated", "document_type": body.document_type}


# ── Orders ────────────────────────────────────────────────────────────────────

@router.get("/orders", response_model=list[ProcessedOrderOut])
def list_orders(status: str | None = None, skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    q = db.query(ProcessedOrder)
    if status:
        q = q.filter(ProcessedOrder.status == status)
    orders = q.order_by(ProcessedOrder.processed_at.desc()).offset(skip).limit(limit).all()
    return [_enrich_order(o) for o in orders]


@router.get("/orders/{order_id}", response_model=ProcessedOrderOut)
def get_order(order_id: UUID, db: Session = Depends(get_db)):
    order = db.query(ProcessedOrder).filter(ProcessedOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return _enrich_order(order)


@router.post("/orders/{order_id}/complete")
def complete_order(order_id: UUID, db: Session = Depends(get_db)):
    order = document_service.manually_complete_order(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return {"status": order.status}


def _enrich_order(order: ProcessedOrder) -> dict:
    lines = order.lines
    return {
        **{c.name: getattr(order, c.name) for c in order.__table__.columns},
        "lines": lines,
        "pending_count": sum(1 for l in lines if l.mapping_status == "pending"),
        "mapped_count": sum(1 for l in lines if l.mapping_status != "pending"),
        "missing_fields": order.missing_fields or [],
    }


# ── Bills ─────────────────────────────────────────────────────────────────────

@router.get("/bills", response_model=list[ProcessedBillOut])
def list_bills(status: str | None = None, skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    q = db.query(ProcessedBill)
    if status:
        q = q.filter(ProcessedBill.status == status)
    bills = q.order_by(ProcessedBill.processed_at.desc()).offset(skip).limit(limit).all()
    return [_enrich_bill(b) for b in bills]


@router.get("/bills/{bill_id}", response_model=ProcessedBillOut)
def get_bill(bill_id: UUID, db: Session = Depends(get_db)):
    bill = db.query(ProcessedBill).filter(ProcessedBill.id == bill_id).first()
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    return _enrich_bill(bill)


@router.post("/bills/{bill_id}/complete")
def complete_bill(bill_id: UUID, db: Session = Depends(get_db)):
    bill = document_service.manually_complete_bill(db, bill_id)
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    return {"status": bill.status}


def _enrich_bill(bill: ProcessedBill) -> dict:
    lines = bill.lines
    return {
        **{c.name: getattr(bill, c.name) for c in bill.__table__.columns},
        "lines": lines,
        "pending_count": sum(1 for l in lines if l.mapping_status == "pending"),
        "mapped_count": sum(1 for l in lines if l.mapping_status != "pending"),
        "missing_fields": bill.missing_fields or [],
    }
