import io
from decimal import Decimal
from uuid import UUID

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from sqlalchemy.orm import Session

from app.models.document import BillLine, OrderLine, ProcessedBill, ProcessedOrder
from app.models.partner import Partner, PartnerAddress
from app.models.product import Product


def _get_product_name(db: Session, product_id) -> str:
    if not product_id:
        return ""
    p = db.query(Product).filter(Product.id == product_id).first()
    return p.display_name if p else ""


def _get_product_code(db: Session, product_id) -> str:
    if not product_id:
        return ""
    p = db.query(Product).filter(Product.id == product_id).first()
    return p.code if p else ""


def _get_product_uom(db: Session, product_id, fallback: str = "") -> str:
    if not product_id:
        return fallback or ""
    p = db.query(Product).filter(Product.id == product_id).first()
    return p.uom if p else fallback or ""


def _get_partner(db: Session, partner_id) -> Partner | None:
    if not partner_id:
        return None
    return db.query(Partner).filter(Partner.id == partner_id).first()


def _get_address(db: Session, addr_id) -> PartnerAddress | None:
    if not addr_id:
        return None
    return db.query(PartnerAddress).filter(PartnerAddress.id == addr_id).first()


def _style_header(ws, headers: list[str]) -> None:
    fill = PatternFill(start_color="1F4E79", end_color="1F4E79", fill_type="solid")
    font = Font(color="FFFFFF", bold=True)
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.fill = fill
        cell.font = font
        cell.alignment = Alignment(horizontal="center")


def _dec(val) -> float | None:
    if val is None:
        return None
    return float(val)


# ── Misa format ───────────────────────────────────────────────────────────────

MISA_ORDER_HEADERS = [
    "Ngày chứng từ", "Số chứng từ", "Mã đối tượng", "Tên đối tượng", "MST",
    "Địa chỉ giao", "Mã hàng", "Tên hàng", "ĐVT", "Số lượng",
    "Đơn giá", "Thành tiền",
]

MISA_BILL_HEADERS = [
    "Ngày hóa đơn", "Số hóa đơn", "Mã đối tượng", "Tên đối tượng", "MST",
    "Mã hàng", "Tên hàng", "ĐVT", "Số lượng", "Đơn giá",
    "Thành tiền", "Thuế suất (%)", "Tiền thuế",
]

BRAVO_ORDER_HEADERS = [
    "DocDate", "DocNo", "PartnerCode", "PartnerName", "TaxCode",
    "DeliveryAddress", "ItemCode", "ItemName", "Unit", "Qty",
    "UnitPrice", "Amount",
]

BRAVO_BILL_HEADERS = [
    "InvoiceDate", "InvoiceNo", "VendorCode", "VendorName", "TaxCode",
    "ItemCode", "ItemName", "Unit", "Qty", "UnitPrice",
    "Amount", "TaxRate", "TaxAmount",
]


def export_order_to_excel(db: Session, order_id: UUID, fmt: str = "misa") -> bytes:
    order = db.query(ProcessedOrder).filter(ProcessedOrder.id == order_id).first()
    if not order:
        raise ValueError(f"ProcessedOrder {order_id} not found")

    partner = _get_partner(db, order.partner_id)
    address = _get_address(db, order.delivery_address_id)

    # Use MISA template format (2 sheets)
    if fmt == "misa_template":
        return _export_order_misa_template(db, order, partner, address)

    wb = Workbook()
    ws = wb.active
    ws.title = "Đơn đặt hàng" if fmt == "misa" else "PurchaseOrder"

    headers = MISA_ORDER_HEADERS if fmt == "misa" else BRAVO_ORDER_HEADERS
    _style_header(ws, headers)

    doc_date = str(order.order_date) if order.order_date else ""
    partner_code = partner.code if partner else ""
    partner_name = partner.legal_name if partner else ""
    tax_code = partner.tax_code if partner else ""
    addr_text = address.full_address if address else ""

    for line in order.lines:
        row = [
            doc_date,
            order.order_number or "",
            partner_code,
            partner_name,
            tax_code,
            addr_text,
            _get_product_code(db, line.product_id) or line.temp_code,
            _get_product_name(db, line.product_id) or line.product_name_original,
            _get_product_uom(db, line.product_id, line.uom_original),
            _dec(line.quantity),
            _dec(line.unit_price),
            _dec(line.line_total),
        ]
        ws.append(row)

    for col in ws.columns:
        ws.column_dimensions[col[0].column_letter].width = 18

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    order.status = "exported"
    db.commit()
    return buf.getvalue()


def _export_order_misa_template(db: Session, order, partner, address) -> bytes:
    """Export order using MISA import template format (2 sheets)."""
    wb = Workbook()

    # Sheet 1: Nhập khẩu Đơn hàng
    ws_order = wb.active
    ws_order.title = "Nhập khẩu Đơn hàng"

    order_headers = [
        "Sử dụng ngoại tệ", "Loại tiền", "Tỷ giá", "Số đơn hàng (*)",
        "Ngày đặt hàng (*)", "Số PO", "Nhân viên bán hàng (*)", "Khách hàng",
        "Liên hệ", "Đơn hàng cha", "Báo giá", "Cơ hội", "Chiến dịch",
        "Giá trị đơn hàng (*)", "Giá trị thanh lý", "Diễn giải",
        "Loại đơn hàng (*)", "Số ngày được nợ", "Hạn giao hàng",
        "Hạn thanh toán (*)", "Tình trạng (*)",
    ]
    for col, h in enumerate(order_headers, 1):
        ws_order.cell(row=1, column=col, value=h)

    # Data row
    order_date_str = order.order_date.strftime("%d/%m/%Y") if order.order_date else ""
    delivery_date_str = order.delivery_date.strftime("%d/%m/%Y") if order.delivery_date else ""
    partner_code = partner.code if partner else ""

    ws_order.cell(row=2, column=1, value="KHÔNG")  # Sử dụng ngoại tệ
    ws_order.cell(row=2, column=2, value=order.currency or "VND")  # Loại tiền
    ws_order.cell(row=2, column=4, value="")  # Số đơn hàng — để trống, MISA tự sinh
    ws_order.cell(row=2, column=5, value=order_date_str)  # Ngày đặt hàng
    ws_order.cell(row=2, column=6, value=order.po_number or "")  # Số PO
    ws_order.cell(row=2, column=8, value=partner_code)  # Khách hàng
    ws_order.cell(row=2, column=14, value=_dec(order.total_amount))  # Giá trị đơn hàng
    ws_order.cell(row=2, column=16, value=order.description or "")  # Diễn giải
    ws_order.cell(row=2, column=19, value=delivery_date_str)  # Hạn giao hàng
    ws_order.cell(row=2, column=21, value="Chưa thực hiện")  # Tình trạng

    # Sheet 2: nhập khẩu hàng hóa
    ws_items = wb.create_sheet("nhập khẩu hàng hóa")

    item_headers = [
        "Mã hàng hóa", "Số lượng", "Diễn giải", "Đơn vị tính",
        "Đơn giá", "Thành tiền", "Tỷ lệ chiết khấu", "Tiền chiết khấu",
        "Thuế suất", "Tiền thuế", "Tổng tiền", "Ghi chú", "Hàng KM",
        "Đơn hàng (*)",
    ]
    for col, h in enumerate(item_headers, 1):
        ws_items.cell(row=1, column=col, value=h)

    order_number_ref = ""  # Để trống — MISA tự liên kết khi import

    for idx, line in enumerate(order.lines, 2):
        product_code = _get_product_code(db, line.product_id) or line.ocr_product_code or line.temp_code
        product_name = _get_product_name(db, line.product_id) or line.product_name_original
        uom = _get_product_uom(db, line.product_id, line.uom_original)
        qty = _dec(line.quantity)
        price = _dec(line.unit_price)
        amount = _dec(line.line_total)
        dk_rate = _dec(line.discount_rate)
        dk_amt = _dec(line.discount_amount) or (round(amount * dk_rate / 100, 2) if amount and dk_rate else None)
        tax_rate = _dec(line.tax_rate)
        tax_amt = round((amount - (dk_amt or 0)) * tax_rate / 100, 2) if amount and tax_rate else None
        total = (amount or 0) - (dk_amt or 0) + (tax_amt or 0) if amount else None

        ws_items.cell(row=idx, column=1, value=product_code)
        ws_items.cell(row=idx, column=2, value=qty)
        ws_items.cell(row=idx, column=3, value=product_name)
        ws_items.cell(row=idx, column=4, value=uom)
        ws_items.cell(row=idx, column=5, value=price)
        ws_items.cell(row=idx, column=6, value=amount)
        ws_items.cell(row=idx, column=7, value=dk_rate)
        ws_items.cell(row=idx, column=8, value=dk_amt)
        ws_items.cell(row=idx, column=9, value=f"{int(tax_rate)}%" if tax_rate else None)
        ws_items.cell(row=idx, column=10, value=tax_amt)
        ws_items.cell(row=idx, column=11, value=total)
        ws_items.cell(row=idx, column=14, value=order_number_ref)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    order.status = "exported"
    db.commit()
    return buf.getvalue()


def export_bill_to_excel(db: Session, bill_id: UUID, fmt: str = "misa") -> bytes:
    bill = db.query(ProcessedBill).filter(ProcessedBill.id == bill_id).first()
    if not bill:
        raise ValueError(f"ProcessedBill {bill_id} not found")

    partner = _get_partner(db, bill.partner_id)

    wb = Workbook()
    ws = wb.active
    ws.title = "Hóa đơn GTGT" if fmt == "misa" else "VendorBill"

    headers = MISA_BILL_HEADERS if fmt == "misa" else BRAVO_BILL_HEADERS
    _style_header(ws, headers)

    doc_date = str(bill.invoice_date) if bill.invoice_date else ""
    partner_code = partner.code if partner else ""
    partner_name = partner.legal_name if partner else ""
    tax_code = partner.tax_code if partner else ""

    for line in bill.lines:
        tax_rate = _dec(line.tax_rate)
        amount = _dec(line.line_total)
        tax_amount = round(amount * tax_rate / 100, 2) if amount and tax_rate else None
        row = [
            doc_date,
            bill.invoice_number or "",
            partner_code,
            partner_name,
            tax_code,
            _get_product_code(db, line.product_id) or line.temp_code,
            _get_product_name(db, line.product_id) or line.product_name_original,
            _get_product_uom(db, line.product_id, line.uom_original),
            _dec(line.quantity),
            _dec(line.unit_price),
            amount,
            tax_rate,
            tax_amount,
        ]
        ws.append(row)

    for col in ws.columns:
        ws.column_dimensions[col[0].column_letter].width = 18

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    bill.status = "exported"
    db.commit()
    return buf.getvalue()
