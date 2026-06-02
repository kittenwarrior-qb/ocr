import shutil
import logging
from datetime import datetime, date
from pathlib import Path
from uuid import UUID

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.config import settings
from app.models.document import (
    BillLine,
    OrderLine,
    ProcessedBill,
    ProcessedOrder,
    RawDocument,
)
from app.models.contact import Contact
from app.models.mapping import DocumentCorrection
from app.models.partner import Partner, PartnerAddress
from app.models.product import Product
from app.services import mapping_service, ocr_service, template_service
from app.services.code_generator import generate_order_number
from app.services.pattern_extraction import extract_by_pattern_rules


# ── File upload ───────────────────────────────────────────────────────────────

def save_uploaded_file(file_name: str, file_content: bytes) -> str:
    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S_%f")
    dest = upload_dir / f"{ts}_{file_name}"
    dest.write_bytes(file_content)
    return str(dest)


def create_raw_document(db: Session, file_name: str, file_path: str, session_id=None) -> RawDocument:
    doc = RawDocument(file_name=file_name, file_path=file_path, ocr_status="pending", session_id=session_id)
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


# ── Main OCR + processing pipeline ───────────────────────────────────────────

def process_raw_document(db: Session, raw_doc_id: UUID, use_ai: bool = True) -> dict:
    raw = db.query(RawDocument).filter(RawDocument.id == raw_doc_id).first()
    if not raw:
        raise ValueError(f"RawDocument {raw_doc_id} not found")

    raw.ocr_status = "processing"
    db.commit()

    try:
        if use_ai:
            # Pass 1: extract MST + document type
            first_pass = ocr_service.extract_mst_and_type(raw.file_path)
            tax_code = first_pass.get("tax_code")
            doc_type_hint = first_pass.get("document_type")

            format_hint = first_pass.get("format_hint") or "standard"
            order_number = first_pass.get("order_number")

            # Find template
            template = template_service.find_template(db, tax_code, doc_type_hint, format_hint, order_number)

            # Pass 2: full extraction — dùng alias-aware prompt nếu template có field_aliases
            if template and template.field_aliases:
                system_prompt = template_service.build_prompt_with_aliases(template.field_aliases)
            elif template:
                system_prompt = template.system_prompt
            else:
                system_prompt = None
            extracted = ocr_service.extract_full_document(raw.file_path, system_prompt)

            raw.ocr_raw_text = str(extracted.get("_raw", ""))
            raw.extracted_data = extracted
            raw.document_type = extracted.get("document_type") or doc_type_hint
            raw.template_id = template.id if template else None
        else:
            # No AI — dùng pdfplumber + regex pattern rules
            extracted = extract_by_pattern_rules(raw.file_path)
            raw.extracted_data = extracted
            raw.document_type = extracted.get("document_type") or "purchase_order"

        raw.ocr_status = "done"
        db.commit()

        # Build processed document
        result = _build_processed_document(db, raw, extracted)
        return result

    except Exception as exc:
        raw.ocr_status = "failed"
        # Simplify error message for display
        err_str = str(exc)
        if "402" in err_str or "Payment Required" in err_str:
            raw.ocr_error = "API key hết credit. Vào Settings nạp thêm hoặc đổi key."
        elif "401" in err_str or "Unauthorized" in err_str:
            raw.ocr_error = "API key không hợp lệ. Vào Settings kiểm tra lại key."
        elif "429" in err_str or "Too Many Requests" in err_str:
            raw.ocr_error = "Quá nhiều request. Thử lại sau vài giây."
        elif "API key chưa" in err_str:
            raw.ocr_error = err_str
        else:
            raw.ocr_error = f"Lỗi OCR: {err_str[:150]}"
        db.commit()
        raise


def _build_processed_document(db: Session, raw: RawDocument, data: dict) -> dict:
    doc_type = raw.document_type or "purchase_order"

    if doc_type == "purchase_order":
        # For PO: partner = the BUYER (customer who placed the order)
        # customer_name = buyer, vendor_name = seller (Satori) — we want the buyer
        partner_name = data.get("customer_name") or data.get("recipient_name") or "Unknown"
        # Fallback: if customer_name looks like Satori (the vendor), use delivery address company
        if partner_name and "satori" in partner_name.lower():
            partner_name = data.get("recipient_name") or data.get("delivery_address") or "Unknown"
        tax_code = data.get("customer_tax_code")
        partner_type = "customer"
    else:
        # For bills: partner = the VENDOR
        partner_name = data.get("vendor_name") or data.get("customer_name") or "Unknown"
        tax_code = data.get("vendor_tax_code") or data.get("customer_tax_code")
        partner_type = "vendor"

    delivery_address_text = data.get("delivery_address")
    matched_contact = None

    if doc_type == "purchase_order":
        matched_contact = mapping_service.find_best_contact(
            db,
            partner_name,
            delivery_address_text,
            data.get("recipient_name"),
        )
        contact_partner = mapping_service.find_customer_for_contact(db, matched_contact)
        if contact_partner:
            partner = contact_partner
        else:
            partner = mapping_service.find_existing_partner(
                db,
                (matched_contact.organization if matched_contact and matched_contact.organization else partner_name),
                tax_code,
                partner_type,
            )
        if matched_contact:
            delivery_address_text = matched_contact.delivery_address or matched_contact.address or delivery_address_text
        address = mapping_service.find_existing_address(db, partner.id if partner else None, delivery_address_text)
    else:
        partner = mapping_service.find_or_create_partner(db, partner_name, tax_code, partner_type)
        address = mapping_service.find_or_create_address(db, partner.id, delivery_address_text)

    items = data.get("items") or []

    if doc_type == "purchase_order":
        return _create_order(db, raw, partner, address, data, items, matched_contact, partner_name, delivery_address_text)
    else:
        return _create_bill(db, raw, partner, address, data, items)


def _parse_date(val) -> date | None:
    if not val:
        return None
    if isinstance(val, date):
        return val
    try:
        return date.fromisoformat(str(val)[:10])
    except Exception:
        return None


def _first_partner_address(partner: Partner | None, address_type: str) -> PartnerAddress | None:
    if not partner:
        return None
    return next((a for a in partner.addresses if a.address_type == address_type), None)


def _build_order_extra_data(
    partner: Partner | None,
    address: PartnerAddress | None,
    contact: Contact | None,
    fallback_name: str = "",
    fallback_address: str | None = None,
) -> dict[str, str]:
    billing = _first_partner_address(partner, "billing")
    branch = _first_partner_address(partner, "branch")
    invoice_address = (billing.full_address if billing else None) or (partner.address if partner else None) or ""
    delivery_address = (
        (contact.delivery_address if contact else None)
        or (contact.address if contact else None)
        or (address.full_address if address else None)
        or (branch.full_address if branch else None)
        or fallback_address
        or invoice_address
    )
    contact_phone = ""
    contact_email = ""
    if contact:
        contact_phone = contact.phone or contact.phone_work or ""
        contact_email = contact.email or contact.email_personal or ""

    return {
        "code": partner.code if partner else "",
        "type": partner.display_name if partner else "",
        "name": partner.legal_name if partner else "",
        "tax_code": partner.tax_code if partner else "",
        "phone": partner.phone if partner else "",
        "email": partner.email if partner else "",
        "field": partner.field if partner else "",
        "owner": partner.owner if partner else "",
        "description": partner.description if partner else "",
        "invoice_address": invoice_address,
        "invoice_city": billing.mapping_key if billing else "",
        "invoice_district": "",
        "invoice_ward": "",
        "delivery_address": delivery_address,
        "customer_code": partner.code if partner else "",
        "customer_name": partner.legal_name if partner else "",
        "customer_tax_code": partner.tax_code if partner else "",
        "customer_phone": partner.phone if partner else "",
        "customer_owner": partner.owner if partner else "",
        "invoice_customer": partner.legal_name if partner else "",
        "invoice_buyer": partner.owner if partner else "",
        "invoice_street": invoice_address,
        "delivery_receiver": (contact.name if contact else None) or (partner.owner if partner else "") or "",
        "delivery_phone": contact_phone or (partner.phone if partner else "") or "",
        "delivery_city": (contact.city if contact else "") or "",
        "delivery_district": (contact.district if contact else "") or "",
        "delivery_ward": (contact.ward if contact else "") or "",
        "delivery_street": delivery_address,
        "order_type": "Kênh MT",
        "contact": (contact.name if contact else "") or "",
        "contact_code": (contact.code if contact else "") or "",
        "contact_phone": contact_phone,
        "contact_email": contact_email,
        "contact_organization": (contact.organization if contact else "") or "",
        "contact_address": delivery_address if contact else "",
        "ocr_customer_name": fallback_name or "",
        "ocr_delivery_address": fallback_address or "",
    }


def _create_order(
    db: Session,
    raw,
    partner: Partner | None,
    address: PartnerAddress | None,
    data: dict,
    items: list,
    contact: Contact | None = None,
    fallback_partner_name: str = "",
    fallback_address: str | None = None,
) -> dict:
    missing = _check_missing_order_fields(data, partner, address, items)
    extra_data = _build_order_extra_data(partner, address, contact, fallback_partner_name, fallback_address)
    order = ProcessedOrder(
        raw_document_id=raw.id,
        partner_id=partner.id if partner else None,
        delivery_address_id=address.id if address else None,
        order_number=generate_order_number(db),
        po_number=data.get("order_number"),
        order_date=_parse_date(data.get("order_date")),
        delivery_date=_parse_date(data.get("delivery_date")),
        currency=data.get("currency") or "VND",
        payment_method=data.get("payment_method"),
        recipient_name=data.get("recipient_name") or fallback_partner_name,
        description=data.get("delivery_address") or data.get("description") or fallback_address,
        total_amount=data.get("total_amount"),
        discount_amount=data.get("discount_amount"),
        tax_amount=data.get("tax_amount"),
        missing_fields=missing,
        extra_data=extra_data,
        status="draft",
    )
    db.add(order)
    db.flush()

    lines = _build_order_lines(db, order.id, items)

    pending = sum(1 for l in lines if l.mapping_status == "pending")
    # "completed" = OCR done (có thể chưa map sản phẩm — đó là việc của user)
    # "processing" chỉ dùng khi OCR đang chạy, không phải khi chờ map
    order.status = "completed"
    db.commit()
    db.refresh(order)
    return {"type": "purchase_order", "id": str(order.id), "status": order.status, "missing_fields": missing}


def _create_bill(db: Session, raw, partner, address, data: dict, items: list) -> dict:
    missing = _check_missing_bill_fields(data, partner, items)
    bill = ProcessedBill(
        raw_document_id=raw.id,
        partner_id=partner.id,
        delivery_address_id=address.id if address else None,
        invoice_number=data.get("order_number") or data.get("invoice_number"),
        invoice_date=_parse_date(data.get("order_date") or data.get("invoice_date")),
        delivery_date=_parse_date(data.get("delivery_date")),
        currency=data.get("currency") or "VND",
        payment_method=data.get("payment_method"),
        recipient_name=data.get("recipient_name"),
        description=data.get("description"),
        total_amount=data.get("total_amount"),
        discount_amount=data.get("discount_amount"),
        tax_amount=data.get("tax_amount"),
        missing_fields=missing,
        status="draft",
    )
    db.add(bill)
    db.flush()

    lines = _build_bill_lines(db, bill.id, items)

    pending = sum(1 for l in lines if l.mapping_status == "pending")
    bill.status = "completed"
    db.commit()
    db.refresh(bill)
    return {"type": "vendor_bill", "id": str(bill.id), "status": bill.status, "missing_fields": missing}


def _build_order_lines(db: Session, order_id: UUID, items: list) -> list[OrderLine]:
    lines = []
    for item in items:
        product_name = item.get("product_name") or "Unknown"
        temp_code, product_id = mapping_service.resolve_temp_code(
            db, item.get("product_code"), product_name
        )
        product = db.query(Product).filter(Product.id == product_id).first() if product_id else None
        unit_price = item.get("unit_price")
        line_total = item.get("line_total")
        tax_rate = item.get("tax_rate")
        quantity = item.get("quantity")
        if product:
            if unit_price is None and product.price is not None:
                unit_price = product.price
            if line_total is None and unit_price is not None and quantity is not None:
                line_total = unit_price * quantity
            if tax_rate is None and product.tax_rate is not None:
                tax_rate = product.tax_rate
        line = OrderLine(
            processed_order_id=order_id,
            temp_code=temp_code,
            product_id=product_id,
            product_name_original=product_name,
            ocr_product_code=item.get("product_code"),
            quantity=quantity,
            unit_price=unit_price,
            discount_rate=item.get("discount_rate"),
            discount_amount=item.get("discount_amount"),
            tax_rate=tax_rate,
            line_total=line_total,
            uom_original=item.get("unit"),
            mapping_status="mapped" if product_id else "pending",
        )
        db.add(line)
        lines.append(line)
    db.flush()
    return lines


def _build_bill_lines(db: Session, bill_id: UUID, items: list) -> list[BillLine]:
    lines = []
    for item in items:
        product_name = item.get("product_name") or "Unknown"
        temp_code, product_id = mapping_service.resolve_temp_code(
            db, item.get("product_code"), product_name
        )
        product = db.query(Product).filter(Product.id == product_id).first() if product_id else None
        unit_price = item.get("unit_price")
        line_total = item.get("line_total")
        tax_rate = item.get("tax_rate")
        quantity = item.get("quantity")
        if product:
            if unit_price is None and product.price is not None:
                unit_price = product.price
            if line_total is None and unit_price is not None and quantity is not None:
                line_total = unit_price * quantity
            if tax_rate is None and product.tax_rate is not None:
                tax_rate = product.tax_rate
        line = BillLine(
            processed_bill_id=bill_id,
            temp_code=temp_code,
            product_id=product_id,
            product_name_original=product_name,
            ocr_product_code=item.get("product_code"),
            quantity=quantity,
            unit_price=unit_price,
            discount_rate=item.get("discount_rate"),
            discount_amount=item.get("discount_amount"),
            tax_rate=tax_rate,
            line_total=line_total,
            uom_original=item.get("unit"),
            mapping_status="mapped" if product_id else "pending",
        )
        db.add(line)
        lines.append(line)
    db.flush()
    return lines


# ── Missing field validation ──────────────────────────────────────────────────

def _check_missing_order_fields(data: dict, partner, address, items: list) -> list[str]:
    missing = []
    # REQUIRED fields
    if not data.get("order_date"):
        missing.append("Ngày đặt hàng (order_date) — BẮT BUỘC")
    if not data.get("delivery_date"):
        missing.append("Ngày giao hàng (delivery_date) — BẮT BUỘC")
    if not data.get("total_amount"):
        missing.append("Giá trị đơn hàng (total_amount) — BẮT BUỘC")
    
    # Optional fields
    if not data.get("order_number"):
        missing.append("Số PO (po_number)")
    if not partner or partner.legal_name in (None, "Unknown"):
        missing.append("Khách hàng (customer_name)")
    if not data.get("currency"):
        missing.append("Tiền tệ (currency)")
    if not data.get("payment_method"):
        missing.append("Hình thức thanh toán (payment_method)")
    if not address:
        missing.append("Địa điểm giao hàng (delivery_address)")
    if not data.get("recipient_name"):
        missing.append("Người nhận hàng (recipient_name)")
    
    if not items:
        missing.append("Chi tiết mặt hàng — không có dòng sản phẩm nào")
    else:
        for i, item in enumerate(items, 1):
            # REQUIRED item fields
            if item.get("quantity") is None:
                missing.append(f"Dòng {i}: Số lượng — BẮT BUỘC")
            if not item.get("unit"):
                missing.append(f"Dòng {i}: Đơn vị tính — BẮT BUỘC")
            if item.get("line_total") is None:
                missing.append(f"Dòng {i}: Thành tiền — BẮT BUỘC")
            # Optional item fields
            if not item.get("product_name"):
                missing.append(f"Dòng {i}: Tên hàng hóa")
    return missing


def _check_missing_bill_fields(data: dict, partner, items: list) -> list[str]:
    missing = []
    if not (data.get("order_number") or data.get("invoice_number")):
        missing.append("Số hóa đơn (invoice_number)")
    if not (data.get("order_date") or data.get("invoice_date")):
        missing.append("Ngày hóa đơn (invoice_date)")
    if not partner or partner.legal_name in (None, "Unknown"):
        missing.append("Nhà cung cấp (vendor_name)")
    if not data.get("currency"):
        missing.append("Tiền tệ (currency)")
    if not data.get("payment_method"):
        missing.append("Hình thức thanh toán (payment_method)")
    if not items:
        missing.append("Chi tiết mặt hàng — không có dòng sản phẩm nào")
    else:
        for i, item in enumerate(items, 1):
            if not item.get("product_name"):
                missing.append(f"Dòng {i}: Tên hàng hóa")
            if item.get("quantity") is None:
                missing.append(f"Dòng {i}: Số lượng")
            if item.get("unit_price") is None:
                missing.append(f"Dòng {i}: Đơn giá")
            if item.get("tax_rate") is None:
                missing.append(f"Dòng {i}: Thuế suất VAT (%)")
    return missing


# ── Corrections ───────────────────────────────────────────────────────────────

def apply_correction(db: Session, raw_doc_id: UUID, field_path: str, corrected_value) -> DocumentCorrection:
    raw = db.query(RawDocument).filter(RawDocument.id == raw_doc_id).first()
    original = _get_nested(raw.extracted_data or {}, field_path)
    correction = DocumentCorrection(
        raw_document_id=raw_doc_id,
        field_path=field_path,
        original_value=original,
        corrected_value=corrected_value,
    )
    db.add(correction)
    db.commit()
    db.refresh(correction)
    return correction


def get_effective_data(db: Session, raw_doc_id: UUID) -> dict:
    raw = db.query(RawDocument).filter(RawDocument.id == raw_doc_id).first()
    data = dict(raw.extracted_data or {})
    corrections = db.query(DocumentCorrection).filter(
        DocumentCorrection.raw_document_id == raw_doc_id
    ).all()
    for correction in corrections:
        _set_nested(data, correction.field_path, correction.corrected_value)
    return data


def _get_nested(data: dict, path: str):
    parts = path.split(".")
    cur = data
    for part in parts:
        if isinstance(cur, dict):
            cur = cur.get(part)
        elif isinstance(cur, list):
            try:
                cur = cur[int(part)]
            except (IndexError, ValueError):
                return None
        else:
            return None
    return cur


def _set_nested(data: dict, path: str, value) -> None:
    parts = path.split(".")
    cur = data
    for part in parts[:-1]:
        if isinstance(cur, dict):
            cur = cur.setdefault(part, {})
        elif isinstance(cur, list):
            cur = cur[int(part)]
    last = parts[-1]
    if isinstance(cur, dict):
        cur[last] = value
    elif isinstance(cur, list):
        cur[int(last)] = value


# ── Manual complete ───────────────────────────────────────────────────────────

def manually_complete_order(db: Session, order_id: UUID) -> ProcessedOrder:
    order = db.query(ProcessedOrder).filter(ProcessedOrder.id == order_id).first()
    if order and order.status in ("draft", "processing"):
        order.status = "completed"
        db.commit()
    return order


def manually_complete_bill(db: Session, bill_id: UUID) -> ProcessedBill:
    bill = db.query(ProcessedBill).filter(ProcessedBill.id == bill_id).first()
    if bill and bill.status in ("draft", "processing"):
        bill.status = "completed"
        db.commit()
    return bill


# ── Dashboard stats ───────────────────────────────────────────────────────────

def get_dashboard_stats(db: Session) -> dict:
    from app.models.mapping import TempCodeMapping
    pending_mappings = db.query(TempCodeMapping).filter(TempCodeMapping.status == "pending").count()
    processing_orders = db.query(ProcessedOrder).filter(ProcessedOrder.status == "processing").count()
    processing_bills = db.query(ProcessedBill).filter(ProcessedBill.status == "processing").count()
    return {
        "pending_temp_codes": pending_mappings,
        "processing_orders": processing_orders,
        "processing_bills": processing_bills,
        "total_processing": processing_orders + processing_bills,
    }
