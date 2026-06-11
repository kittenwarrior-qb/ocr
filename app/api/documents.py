from typing import Optional, List
from uuid import UUID
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.database import get_db
from app.models.document import OrderLine, ProcessedBill, ProcessedOrder, RawDocument
from app.models.partner import Partner
from app.models.product import Product
from app.schemas.document import (
    CorrectionCreate,
    DocumentTypeOverride,
    OrderUpdateRequest,
    ProcessedBillOut,
    ProcessedOrderOut,
    RawDocumentOut,
    UploadResponse,
    LineOut,
    BillLineOut,
)
from app.services import document_service
from app.services.excel_import_service import import_excel_to_orders
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
    use_ai: Optional[str] = Form("true"),
    db: Session = Depends(get_db),
):
    content = file.file.read()
    file_path = document_service.save_uploaded_file(file.filename, content)
    raw = document_service.create_raw_document(db, file.filename, file_path, session_id=_parse_session_id(session_id))
    enqueue(raw.id, use_ai=use_ai != "false")
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
    use_ai: Optional[str] = Form("true"),
    db: Session = Depends(get_db),
):
    from app.models.session import OcrSession

    parsed_sid = _parse_session_id(session_id)
    ai_enabled = use_ai != "false"

    # Auto-create session if not provided
    if not parsed_sid:
        file_names = [f.filename for f in files]
        session_name = file_names[0] if len(file_names) == 1 else f"{len(file_names)} đơn hàng"
        new_session = OcrSession(name=session_name)
        db.add(new_session)
        db.flush()
        parsed_sid = new_session.id

    # Kiểm tra trùng tên file trong phiên
    duplicates = []
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
        enqueue(raw.id, use_ai=ai_enabled)
        results.append({
            "raw_document_id": str(raw.id),
            "file_name": raw.file_name,
            "ocr_status": raw.ocr_status,
            "is_duplicate": raw.file_name in duplicates,
        })

    db.commit()
    return {
        "session_id": str(parsed_sid),
        "uploaded": len(results),
        "queue_pending": queue_pending(),
        "duplicates": duplicates,
        "files": results,
    }


@router.get("/queue-status")
def get_queue_status():
    return {"queue_pending": queue_pending(), "workers": worker_count()}


@router.post("/check-filenames")
def check_filenames(body: dict, db: Session = Depends(get_db)):
    """
    Given a list of filenames, return their latest OCR status in the system.
    Response: { filename: ocr_status | null }
    ocr_status values: "pending" | "processing" | "done" | "failed" | null (not found)
    """
    filenames: list[str] = body.get("filenames", [])
    if not filenames:
        return {}
    rows = (
        db.query(RawDocument.file_name, RawDocument.ocr_status)
        .filter(RawDocument.file_name.in_(filenames))
        .order_by(RawDocument.upload_date.desc())
        .all()
    )
    # keep only latest status per filename (first hit due to desc order)
    seen: dict[str, str] = {}
    for file_name, ocr_status in rows:
        if file_name not in seen:
            seen[file_name] = ocr_status
    return {name: seen.get(name, None) for name in filenames}


@router.get("/raw", response_model=list[RawDocumentOut])
def list_raw_documents(skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    return db.query(RawDocument).order_by(RawDocument.upload_date.desc()).offset(skip).limit(limit).all()


@router.get("/raw/{raw_doc_id}", response_model=RawDocumentOut)
def get_raw_document(raw_doc_id: UUID, db: Session = Depends(get_db)):
    doc = db.query(RawDocument).filter(RawDocument.id == raw_doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.get("/raw/{raw_doc_id}/file")
def get_raw_file(raw_doc_id: UUID, download: bool = False, db: Session = Depends(get_db)):
    """Trả về file gốc (PDF/JPG/Excel) để embed trong iframe hoặc tải về máy"""
    doc = db.query(RawDocument).filter(RawDocument.id == raw_doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    file_path = Path(doc.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    suffix = file_path.suffix.lower()
    media_types = {
        '.pdf': 'application/pdf',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
    }
    media_type = media_types.get(suffix, 'application/octet-stream')
    if download:
        # Ép trình duyệt tải về với đúng tên file gốc (kể cả tiếng Việt có dấu).
        return FileResponse(file_path, media_type=media_type, filename=doc.file_name)
    # Không download: set Content-Disposition: inline để trình duyệt nhúng nội
    # dung trực tiếp trong <iframe> thay vì tải về — một số Chrome/Chromium từ
    # chối render PDF trong iframe nếu header này vắng mặt hoàn toàn.
    # Starlette dùng setdefault nên header truyền vào qua `headers=` được giữ
    # nguyên, không bị ghi đè bởi logic tự sinh tên file trong set_headers().
    return FileResponse(file_path, media_type=media_type, headers={"content-disposition": "inline"})


@router.get("/raw/{raw_doc_id}/image")
def get_raw_image(raw_doc_id: UUID, db: Session = Depends(get_db)):
    """Trả về ảnh gốc của document (PDF convert sang JPG nếu cần)"""
    doc = db.query(RawDocument).filter(RawDocument.id == raw_doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    file_path = Path(doc.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")
    
    # Nếu là PDF, convert page đầu sang JPG
    if file_path.suffix.lower() == '.pdf':
        try:
            from pdf2image import convert_from_path
            import io
            images = convert_from_path(str(file_path), first_page=1, last_page=1, dpi=150)
            if not images:
                raise HTTPException(status_code=500, detail="Cannot convert PDF to image")
            
            img = images[0]
            buf = io.BytesIO()
            img.save(buf, format='JPEG', quality=85)
            buf.seek(0)
            return StreamingResponse(buf, media_type="image/jpeg")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"PDF conversion error: {str(e)}")
    
    # Nếu là ảnh, trả về trực tiếp
    return FileResponse(file_path, media_type=f"image/{file_path.suffix[1:]}")


@router.get("/raw/{raw_doc_id}/annotated-image")
def get_annotated_image(raw_doc_id: UUID, db: Session = Depends(get_db)):
    """Trả về ảnh đã khoanh tròn các field đã extract"""
    doc = db.query(RawDocument).filter(RawDocument.id == raw_doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    file_path = Path(doc.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")
    
    # Nếu chưa có bbox data, trả về ảnh gốc
    if not doc.extraction_bboxes:
        return get_raw_image(raw_doc_id, db)
    
    try:
        from app.services.visual_ocr_service import generate_annotated_image
        import io
        
        image_bytes = generate_annotated_image(
            str(file_path),
            doc.extracted_data or {},
            doc.extraction_bboxes
        )
        
        return StreamingResponse(
            io.BytesIO(image_bytes),
            media_type="image/jpeg"
        )
    except Exception as e:
        # Fallback to original image if annotation fails
        return get_raw_image(raw_doc_id, db)


@router.post("/raw/{raw_doc_id}/reprocess")
def reprocess_document(raw_doc_id: UUID, db: Session = Depends(get_db)):
    doc = db.query(RawDocument).filter(RawDocument.id == raw_doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    doc.ocr_status = "pending"
    db.commit()
    enqueue(raw_doc_id, use_ai=True)
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


# ── Excel Import ──────────────────────────────────────────────────────────────

@router.post("/upload-excel")
def upload_excel(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Upload an Excel file containing purchase orders. Parses and creates orders."""
    if not file.filename or not (file.filename.endswith('.xlsx') or file.filename.endswith('.xls')):
        raise HTTPException(status_code=400, detail="Only .xlsx/.xls files are supported")

    content = file.file.read()
    file_path = document_service.save_uploaded_file(file.filename, content)

    try:
        result = import_excel_to_orders(db, file_path, file.filename)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to parse Excel: {str(e)}")

    return result


# ── Orders ────────────────────────────────────────────────────────────────────

@router.post("/orders/manual")
def create_manual_order(db: Session = Depends(get_db)):
    """Tạo đơn hàng trống để nhập tay (mặc định Kênh B2B, ngày đặt hàng = hôm nay)."""
    order, session_id = document_service.create_manual_order(db, order_type="Kênh B2B")
    return {
        "order_id": str(order.id),
        "session_id": str(session_id),
    }


@router.get("/orders", response_model=list[ProcessedOrderOut])
def list_orders(status: str | None = None, skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    q = db.query(ProcessedOrder)
    if status:
        q = q.filter(ProcessedOrder.status == status)
    orders = q.order_by(ProcessedOrder.processed_at.desc()).offset(skip).limit(limit).all()
    return [_enrich_order(o, db) for o in orders]


@router.get("/orders/{order_id}", response_model=ProcessedOrderOut)
def get_order(order_id: UUID, db: Session = Depends(get_db)):
    order = db.query(ProcessedOrder).filter(ProcessedOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return _enrich_order(order, db)


@router.get("/orders/{order_id}/file")
def get_order_file(order_id: UUID, db: Session = Depends(get_db)):
    order = db.query(ProcessedOrder).filter(ProcessedOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return get_raw_file(order.raw_document_id, db)


@router.post("/orders/{order_id}/split")
def split_order(order_id: UUID, db: Session = Depends(get_db)):
    """Split an order with mixed tax rates into one order per distinct tax rate.
    The original order keeps its lines for the lowest tax-rate group.
    New orders are created for each remaining group, sharing the same PO number
    and all header data (customer, dates, address, etc.).
    """
    from collections import defaultdict
    import copy

    order = db.query(ProcessedOrder).filter(ProcessedOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    lines = db.query(OrderLine).filter(OrderLine.processed_order_id == order.id).all()
    if not lines:
        raise HTTPException(status_code=400, detail="Order has no lines")

    # Group by tax_rate (round to 1 decimal to avoid float noise)
    groups: dict[str, list[OrderLine]] = defaultdict(list)
    for line in lines:
        key = str(round(float(line.tax_rate or 0), 1))
        groups[key].append(line)

    if len(groups) < 2:
        raise HTTPException(status_code=400, detail="Order only has one tax rate — nothing to split")

    sorted_keys = sorted(groups.keys(), key=float)

    def _calc_totals(grp_lines: list[OrderLine]):
        subtotal = sum(float(l.line_total or 0) for l in grp_lines)
        tax = sum(round(float(l.line_total or 0) * float(l.tax_rate or 0) / 100) for l in grp_lines)
        return subtotal + tax, tax

    result_orders: list[ProcessedOrder] = [order]

    # Create new orders first (idx > 0), move their lines
    for key in sorted_keys[1:]:
        grp_lines = groups[key]
        total_with_tax, tax_amount = _calc_totals(grp_lines)
        pending = sum(1 for l in grp_lines if l.mapping_status == "pending")

        new_order = ProcessedOrder(
            raw_document_id=order.raw_document_id,
            partner_id=order.partner_id,
            delivery_address_id=order.delivery_address_id,
            order_number=None,
            po_number=order.po_number,
            order_date=order.order_date,
            delivery_date=order.delivery_date,
            currency=order.currency,
            payment_method=order.payment_method,
            recipient_name=order.recipient_name,
            description=order.description,
            discount_amount=None,
            extra_data=copy.deepcopy(order.extra_data) if order.extra_data else {},
            missing_fields=list(order.missing_fields) if order.missing_fields else [],
            total_amount=total_with_tax,
            tax_amount=tax_amount,
            status="draft" if pending > 0 else "completed",
        )
        db.add(new_order)
        db.flush()  # get new_order.id before assigning lines

        for line in grp_lines:
            line.processed_order_id = new_order.id

        result_orders.append(new_order)

    db.flush()

    # Update original order totals (only group-0 lines remain)
    grp0 = groups[sorted_keys[0]]
    total_with_tax0, tax_amount0 = _calc_totals(grp0)
    pending0 = sum(1 for l in grp0 if l.mapping_status == "pending")
    order.total_amount = total_with_tax0
    order.tax_amount = tax_amount0
    order.status = "draft" if pending0 > 0 else "completed"

    db.commit()
    for o in result_orders:
        db.refresh(o)

    return [_enrich_order(o, db) for o in result_orders]


@router.post("/orders/{order_id}/complete")
def complete_order(order_id: UUID, db: Session = Depends(get_db)):
    order = document_service.manually_complete_order(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return {"status": order.status}


@router.delete("/orders/{order_id}")
def delete_order(order_id: UUID, also_raw: bool = False, db: Session = Depends(get_db)):
    """Delete an order (and optionally its raw document / PDF)."""
    order = db.query(ProcessedOrder).filter(ProcessedOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    raw_doc_id = order.raw_document_id
    db.delete(order)
    if also_raw and raw_doc_id:
        raw = db.query(RawDocument).filter(RawDocument.id == raw_doc_id).first()
        if raw:
            db.delete(raw)
    db.commit()
    return {"deleted": str(order_id)}


@router.patch("/orders/{order_id}")
def update_order(order_id: UUID, body: OrderUpdateRequest, db: Session = Depends(get_db)):
    """Update order fields - dùng cho OrderReview"""
    order = db.query(ProcessedOrder).filter(ProcessedOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Update các field được gửi lên
    if body.order_date is not None:
        order.order_date = body.order_date
    if body.delivery_date is not None:
        order.delivery_date = body.delivery_date
    if body.total_amount is not None:
        order.total_amount = body.total_amount
    if body.order_number is not None:
        order.order_number = body.order_number
    if body.po_number is not None:
        order.po_number = body.po_number
    if body.partner_id is not None:
        order.partner_id = body.partner_id
    if body.delivery_address_id is not None:
        order.delivery_address_id = body.delivery_address_id
    if body.currency is not None:
        order.currency = body.currency
    if body.payment_method is not None:
        order.payment_method = body.payment_method
    if body.recipient_name is not None:
        order.recipient_name = body.recipient_name
    if body.description is not None:
        order.description = body.description
    if body.discount_amount is not None:
        order.discount_amount = body.discount_amount
    if body.extra_data is not None:
        order.extra_data = body.extra_data
        flag_modified(order, "extra_data")
        customer_code = body.extra_data.get("customer_code") if isinstance(body.extra_data, dict) else None
        contact_code = body.extra_data.get("contact_code") if isinstance(body.extra_data, dict) else None
        # Người dùng chủ động chọn/sửa khách hàng hoặc liên hệ trong form đơn
        # = đã xác nhận thủ công. Đánh dấu "manual" để FE không còn hiển thị
        # cảnh báo "tự động ghép — chưa xác nhận" cho field tương ứng nữa.
        if customer_code:
            order.extra_data["customer_match_type"] = "manual"
            flag_modified(order, "extra_data")
            partner = db.query(Partner).filter(Partner.code == customer_code, Partner.partner_type == "customer").first()
            if partner:
                order.partner_id = partner.id
                # Auto-learn: lấy tên công ty GỐC từ OCR (không dùng recipient_name - có thể là tên người)
                from app.services.company_alias_service import upsert as upsert_company
                customer_name = body.extra_data.get("customer_name") or partner.legal_name or ""
                # Ưu tiên: extracted_data từ raw PDF > partner_name được OCR nhận ra
                raw_doc = db.query(RawDocument).filter(RawDocument.id == order.raw_document_id).first()
                extracted = raw_doc.extracted_data or {} if raw_doc else {}
                # Chỉ học tên công ty thực sự, không học tên người
                ocr_company = (extracted.get("customer_name") or "").strip()
                ocr_address = (extracted.get("delivery_address") or "").strip()
                if ocr_company and len(ocr_company) > 3:
                    upsert_company(db, ocr_company, customer_code, customer_name, "name", "auto_learn")
                if ocr_address and len(ocr_address) > 15:
                    upsert_company(db, ocr_address, customer_code, customer_name, "address", "auto_learn")
        if contact_code:
            order.extra_data["contact_match_type"] = "manual"
            flag_modified(order, "extra_data")
    if body.lines is not None:
        existing_lines = {str(line.id): line for line in order.lines}
        kept_line_ids: set[str] = set()
        for line_data in body.lines:
            line_id = str(line_data.get("id") or "")
            line = existing_lines.get(line_id)
            if not line:
                line = OrderLine(
                    processed_order_id=order.id,
                    temp_code=str(line_data.get("temp_code") or line_data.get("ocr_product_code") or f"manual-{len(existing_lines) + 1}"),
                    product_name_original=str(line_data.get("product_name_original") or ""),
                )
                db.add(line)
                db.flush()
                existing_lines[str(line.id)] = line

            for field in (
                "product_name_original",
                "ocr_product_code",
                "uom_original",
                "quantity",
                "unit_price",
                "discount_rate",
                "discount_amount",
                "tax_rate",
                "line_total",
                "mapping_status",
            ):
                if field in line_data:
                    setattr(line, field, line_data[field])

            product_code = str(line_data.get("product_code_mapped") or line_data.get("ocr_product_code") or "").strip()
            if product_code:
                product = db.query(Product).filter(Product.code == product_code).first()
                if product:
                    line.product_id = product.id
            
            kept_line_ids.add(str(line.id))

        current_lines = db.query(OrderLine).filter(OrderLine.processed_order_id == order.id).all()
        for line in current_lines:
            if str(line.id) not in kept_line_ids:
                db.delete(line)

        db.flush()
        remaining_lines = db.query(OrderLine).filter(OrderLine.processed_order_id == order.id).all()
        pending = sum(1 for line in remaining_lines if line.mapping_status == "pending")
        if pending == 0:
            order.status = "completed"
    
    db.commit()
    db.refresh(order)
    return _enrich_order(order, db)


def _enrich_order(order: ProcessedOrder, db: Session | None = None) -> dict:
    lines = db.query(OrderLine).filter(OrderLine.processed_order_id == order.id).all() if db else order.lines
    # Lấy file_name từ RawDocument
    file_name = None
    if db and order.raw_document_id:
        raw_doc = db.query(RawDocument).filter(RawDocument.id == order.raw_document_id).first()
        if raw_doc:
            file_name = raw_doc.file_name
    line_dicts = [
        {
            **{c.name: getattr(l, c.name) for c in l.__table__.columns},
            "product_code": l.product.code if l.product else None,
        }
        for l in lines
    ]
    return {
        **{c.name: getattr(order, c.name) for c in order.__table__.columns},
        "file_name": file_name,
        "lines": line_dicts,
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
