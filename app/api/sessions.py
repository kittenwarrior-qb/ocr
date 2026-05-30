from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
import io

from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.session import SessionCreate, SessionOut
from app.services import session_service

router = APIRouter(prefix="/sessions", tags=["Sessions"])


def _to_out(s, db: Session) -> dict:
    stats = session_service.session_stats(db, s)
    return {
        "id": s.id,
        "name": s.name,
        "note": s.note,
        "status": s.status,
        "created_at": s.created_at,
        "closed_at": s.closed_at,
        **stats,
    }


@router.get("", response_model=list[SessionOut])
def list_sessions(db: Session = Depends(get_db)):
    sessions = session_service.list_sessions(db)
    return [_to_out(s, db) for s in sessions]


@router.post("", response_model=SessionOut)
def create_session(body: SessionCreate, db: Session = Depends(get_db)):
    s = session_service.create_session(db, body.name, body.note)
    return _to_out(s, db)


@router.get("/{session_id}", response_model=SessionOut)
def get_session(session_id: UUID, db: Session = Depends(get_db)):
    s = session_service.get_session(db, session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    return _to_out(s, db)


@router.post("/{session_id}/close", response_model=SessionOut)
def close_session(session_id: UUID, db: Session = Depends(get_db)):
    s = session_service.close_session(db, session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    return _to_out(s, db)


@router.post("/{session_id}/reopen", response_model=SessionOut)
def reopen_session(session_id: UUID, db: Session = Depends(get_db)):
    s = session_service.reopen_session(db, session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    return _to_out(s, db)


@router.get("/{session_id}/export")
def export_session(session_id: UUID, db: Session = Depends(get_db)):
    s = session_service.get_session(db, session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    xlsx_bytes = session_service.export_session_excel(db, session_id)
    from urllib.parse import quote
    safe_name = s.name.replace("/", "-").replace("\\", "-").replace(" ", "_")
    date_str = s.created_at.strftime("%Y%m%d")
    filename_utf8 = quote(f"don_hang_{safe_name}_{date_str}.xlsx", safe="")
    return StreamingResponse(
        io.BytesIO(xlsx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename_utf8}"},
    )


@router.get("/{session_id}/details")
def get_session_details(session_id: UUID, db: Session = Depends(get_db)):
    """Return session with all orders, lines, and mapping status for the review UI."""
    from app.models.document import ProcessedOrder, RawDocument

    s = session_service.get_session(db, session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")

    # Get all raw docs in this session
    raw_docs = db.query(RawDocument).filter(RawDocument.session_id == session_id).all()

    # Get all orders linked to these raw docs
    raw_doc_ids = [d.id for d in raw_docs]
    orders = db.query(ProcessedOrder).filter(
        ProcessedOrder.raw_document_id.in_(raw_doc_ids)
    ).all() if raw_doc_ids else []

    # Build response
    orders_out = []
    total_products = 0
    total_unmapped = 0
    for order in orders:
        lines = order.lines
        pending = sum(1 for l in lines if l.mapping_status == "pending")
        mapped = sum(1 for l in lines if l.mapping_status != "pending")
        total_products += len(lines)
        total_unmapped += pending

        # Find file name and partner name
        raw_doc = next((d for d in raw_docs if d.id == order.raw_document_id), None)
        partner_name = order.partner.legal_name if order.partner else None
        # Fallback: use recipient_name if partner not linked
        display_name = partner_name or order.recipient_name
        delivery_addr = order.delivery_address.full_address if order.delivery_address else None

        orders_out.append({
            "id": str(order.id),
            "file_name": raw_doc.file_name if raw_doc else None,
            "order_number": order.order_number,
            "order_date": str(order.order_date) if order.order_date else None,
            "delivery_date": str(order.delivery_date) if order.delivery_date else None,
            "total_amount": float(order.total_amount) if order.total_amount else None,
            "recipient_name": order.recipient_name,
            "partner_name": display_name,
            "delivery_address": delivery_addr or (order.description if order.description and len(order.description) < 200 else None),
            "description": order.description,
            "partner_id": str(order.partner_id) if order.partner_id else None,
            "extra_data": order.extra_data,
            "status": order.status,
            "pending_count": pending,
            "mapped_count": mapped,
            "lines": [
                {
                    "id": str(l.id),
                    "product_name_original": l.product_name_original,
                    "temp_code": l.temp_code,
                    "product_id": str(l.product_id) if l.product_id else None,
                    "ocr_product_code": l.ocr_product_code,
                    "product_code_mapped": l.product.code if l.product else None,
                    "product_name_mapped": l.product.display_name if l.product else None,
                    "quantity": float(l.quantity) if l.quantity else None,
                    "unit_price": float(l.unit_price) if l.unit_price else None,
                    "line_total": float(l.line_total) if l.line_total else None,
                    "uom_original": l.uom_original,
                    "uom_mapped": l.product.uom if l.product else None,
                    "tax_rate": float(l.tax_rate) if l.tax_rate else None,
                    "mapping_status": l.mapping_status,
                }
                for l in lines
            ],
        })

    # Check OCR processing status
    processing_count = sum(1 for d in raw_docs if d.ocr_status in ("pending", "processing"))
    done_count = sum(1 for d in raw_docs if d.ocr_status == "done")
    failed_count = sum(1 for d in raw_docs if d.ocr_status == "failed")

    return {
        "id": str(s.id),
        "name": s.name,
        "status": s.status,
        "created_at": s.created_at.isoformat(),
        "doc_count": len(raw_docs),
        "processing_count": processing_count,
        "done_count": done_count,
        "failed_count": failed_count,
        "total_products": total_products,
        "total_unmapped": total_unmapped,
        "orders": orders_out,
    }
