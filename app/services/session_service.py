import io
from datetime import datetime
from uuid import UUID

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from sqlalchemy.orm import Session

from app.models.session import OcrSession
from app.models.document import RawDocument, ProcessedOrder, ProcessedBill


def create_session(db: Session, name: str, note: str | None = None) -> OcrSession:
    s = OcrSession(name=name, note=note)
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


def list_sessions(db: Session) -> list[OcrSession]:
    return db.query(OcrSession).order_by(OcrSession.created_at.desc()).all()


def get_session(db: Session, session_id: UUID) -> OcrSession | None:
    return db.query(OcrSession).filter(OcrSession.id == session_id).first()


def close_session(db: Session, session_id: UUID) -> OcrSession | None:
    s = get_session(db, session_id)
    if s and s.status == "active":
        s.status = "closed"
        s.closed_at = datetime.utcnow()
        db.commit()
        db.refresh(s)
    return s


def reopen_session(db: Session, session_id: UUID) -> OcrSession | None:
    s = get_session(db, session_id)
    if s and s.status == "closed":
        s.status = "active"
        s.closed_at = None
        db.commit()
        db.refresh(s)
    return s


def session_stats(db: Session, session: OcrSession) -> dict:
    docs = session.raw_documents
    return {
        "doc_count": len(docs),
        "done_count": sum(1 for d in docs if d.ocr_status == "done"),
    }


def _addr_text(obj) -> str | None:
    if obj is None:
        return None
    return (getattr(obj, "full_address", None)
            or getattr(obj, "address", None)
            or getattr(obj, "address_text", None))


def export_session_excel(db: Session, session_id: UUID) -> bytes:
    session = get_session(db, session_id)
    if not session:
        raise ValueError("Session not found")

    rows = _collect_rows(db, session)

    wb = Workbook()
    ws = wb.active
    ws.title = "Chứng từ"

    headers = [
        "Phiên", "Tên file",
        "Ngày chứng từ", "Số chứng từ", "Tiền tệ",
        "Khách hàng / NCC", "Địa chỉ KH", "Người nhận hàng",
        "Địa điểm giao hàng", "Hình thức thanh toán", "Nội dung",
        "Mã hàng (PO gốc)", "Mã nội bộ", "Tên vật tư, hàng hóa", "ĐVT",
        "Số lượng", "Đơn giá VND", "Thành tiền VND",
        "% CK", "Tiền CK VND", "% VAT", "Tiền thuế VND",
    ]

    # Header row style
    header_fill = PatternFill("solid", fgColor="1F4E79")
    header_font = Font(bold=True, color="FFFFFF", size=10)
    thin = Side(border_style="thin", color="AAAAAA")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)

    ws.append(headers)
    for col_idx, _ in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = border
    ws.row_dimensions[1].height = 30

    # Data rows
    for r in rows:
        ws.append(r)

    # Column widths
    col_widths = [16, 22, 14, 18, 8, 30, 28, 18, 32, 22, 22,
                  18, 14, 36, 8, 10, 14, 14, 8, 12, 8, 12]
    for i, w in enumerate(col_widths, 1):
        ws.column_dimensions[ws.cell(row=1, column=i).column_letter].width = w

    # Style data cells
    data_font = Font(size=10)
    for row in ws.iter_rows(min_row=2, max_row=ws.max_row):
        for cell in row:
            cell.font = data_font
            cell.border = border
            cell.alignment = Alignment(vertical="center")

    # Freeze header row
    ws.freeze_panes = "A2"

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _collect_rows(db: Session, session: OcrSession) -> list:
    rows = []
    session_name = session.name
    seen_doc_ids: set = set()  # deduplicate khi cùng file upload nhiều lần

    for raw in session.raw_documents:
        if raw.ocr_status != "done":
            continue

        order = db.query(ProcessedOrder).filter(
            ProcessedOrder.raw_document_id == raw.id
        ).first()
        bill = None
        if not order:
            bill = db.query(ProcessedBill).filter(
                ProcessedBill.raw_document_id == raw.id
            ).first()

        doc = order or bill
        if not doc:
            continue

        # Dedup: cùng (file_name, order_number, partner) chỉ lấy 1 lần
        doc_number = order.order_number if order else bill.invoice_number
        partner_name = doc.partner.legal_name if doc.partner else None
        dedup_key = (raw.file_name, doc_number, partner_name)
        if dedup_key in seen_doc_ids:
            continue
        seen_doc_ids.add(dedup_key)

        partner_addr = _addr_text(doc.partner) if doc.partner else None
        delivery_addr = _addr_text(doc.delivery_address) if doc.delivery_address else None
        doc_date = order.order_date if order else bill.invoice_date
        currency = doc.currency or "VND"
        payment_method = doc.payment_method
        recipient = doc.recipient_name
        description = doc.description

        lines = doc.lines
        if not lines:
            rows.append([
                session_name, raw.file_name,
                str(doc_date) if doc_date else None, doc_number, currency,
                partner_name, partner_addr, recipient,
                delivery_addr, payment_method, description,
                None, None, None, None,
                None, None, None,
                None, None, None, None,
            ])
            continue

        for line in lines:
            # Mã hàng gốc từ PO (barcode/SKU)
            ocr_code = line.ocr_product_code or None
            # Mã nội bộ đã map trong hệ thống
            internal_code = None
            if line.product_id and line.product:
                internal_code = getattr(line.product, "code", None)

            qty = float(line.quantity) if line.quantity is not None else None
            unit_price = float(line.unit_price) if line.unit_price is not None else None
            line_total = float(line.line_total) if line.line_total is not None else None
            disc_rate = float(line.discount_rate) if line.discount_rate is not None else None
            disc_amt = float(line.discount_amount) if line.discount_amount is not None else None
            tax_rate = float(line.tax_rate) if line.tax_rate is not None else None
            tax_amt = None
            if line_total is not None and tax_rate is not None:
                tax_amt = round(line_total * tax_rate / 100, 2)

            rows.append([
                session_name, raw.file_name,
                str(doc_date) if doc_date else None, doc_number, currency,
                partner_name, partner_addr, recipient,
                delivery_addr, payment_method, description,
                ocr_code, internal_code, line.product_name_original, line.uom_original,
                qty, unit_price, line_total,
                disc_rate, disc_amt, tax_rate, tax_amt,
            ])

    return rows
