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


def _export_order_misa_template(db, order, partner, address):
    """Export using MISA template: bold Times New Roman headers, exact col widths, all 61 cols."""
    from openpyxl.styles import Font
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    ws1 = wb.active
    ws1.title = "Nhập khẩu Đơn hàng"

    hdrs1 = [
        "Sử dụng ngoại tệ", "Loại tiền", "Tỷ giá", "Số đơn hàng (*)", "Ngày đặt hàng (*)",
        "Số PO", "Nhân viên bán hàng (*)", "Khách hàng", "Liên hệ", "Đơn hàng cha",
        "Báo giá", "Cơ hội", "Chiến dịch", "Giá trị đơn hàng (*)", "Giá trị thanh lý",
        "Diễn giải", "Loại đơn hàng (*)", "Số ngày được nợ", "Hạn giao hàng", "Hạn thanh toán (*)",
        "Tình trạng (*)", "Ngày ghi sổ", "Thực thu", "Tình trạng giao hàng", "Dự kiến chi",
        "Tình trạng thanh toán", "Hạn sản xuất", "Đã xuất hóa đơn", "Khách hàng (Hóa đơn)", "Người mua hàng",
        "Quốc gia (Hóa đơn)", "Tỉnh/Thành phố (Hóa đơn)", "Quận/Huyện (Hóa đơn)", "Phường/Xã (Hóa đơn)", "Số nhà, Đường phố (Hóa đơn)",
        "Mã vùng (Hóa đơn)", "Địa chỉ (Hóa đơn)", "Phân cụm hóa đơn", "Người nhận hàng", "Điện thoại",
        "Quốc gia (Giao hàng)", "Tỉnh/Thành phố (Giao hàng)", "Quận/Huyện (Giao hàng)", "Phường/Xã (Giao hàng)", "Số nhà, Đường phố (Giao hàng)",
        "Mã vùng (Giao hàng)", "Địa chỉ (Giao hàng)", "Mô tả", "Ghi chú Hóa đơn", "Người thực hiện",
        "Dùng chung", "Ngừng theo dõi", "Đối tác/CTV giới thiệu", "Đồng bộ đơn giá sau CK", "Dự án bán hàng",
        "Nguồn gốc", "Nhân viên kho", "Nhân viên giao hàng", "Ngày giao dự kiến", "Tuyến vận chuyển", "Thực chi",
    ]

    widths1 = [
        16.82, 9.54, 7.0, 15.73, 17.54, 7.18, 22.73, 12.27, 8.45, 13.82,
        8.27, 7.45, 18.54, 19.27, 15.0, 29.73, 17.54, 16.45, 14.54, 18.54,
        14.18, 12.18, 9.73, 20.45, 12.18, 21.27, 13.45, 16.27, 22.18, 16.45,
        19.45, 25.82, 22.82, 21.27, 28.73, 19.45, 65.45, 18.18, 17.0, 10.82,
        20.82, 27.27, 24.27, 22.73, 30.18, 20.82, 65.45, 36.27, 16.82, 23.18,
        12.45, 15.73, 22.18, 24.0, 15.73, 11.27, 14.82, 20.18, 18.18, 18.18, 9.45,
    ]

    hfont = Font(name="Times New Roman", size=11, bold=True)
    for col, h in enumerate(hdrs1, 1):
        cell = ws1.cell(row=1, column=col, value=h)
        cell.font = hfont
        ws1.column_dimensions[get_column_letter(col)].width = widths1[col - 1]

    meta = order.extra_data or {} if order.extra_data else {}
    partner_code = partner.code if partner else ""
    partner_name = partner.legal_name if partner else ""
    addr_text = address.full_address if address else ""
    order_date_str = order.order_date.strftime("%d/%m/%Y") if order.order_date else ""
    delivery_date_str = order.delivery_date.strftime("%d/%m/%Y") if order.delivery_date else ""

    vals1 = [
        "KHONG",                                                    # 1  Su dung ngoai te
        order.currency or "VND",                                    # 2  Loai tien
        1,                                                          # 3  Ty gia
        order.order_number or "",                                   # 4  So don hang
        order_date_str,                                             # 5  Ngay dat hang
        order.po_number or "",                                      # 6  So PO
        meta.get("salesperson", ""),                                # 7  Nhan vien ban hang
        partner_code,                                               # 8  Khach hang
        meta.get("contact", ""),                                    # 9  Lien he
        meta.get("parent_order", ""),                               # 10 Don hang cha
        meta.get("quotation", ""),                                  # 11 Bao gia
        meta.get("opportunity", ""),                                # 12 Co hoi
        meta.get("campaign", ""),                                   # 13 Chien dich
        _dec(order.total_amount),                                   # 14 Gia tri don hang
        meta.get("liquidation_value", ""),                          # 15 Gia tri thanh ly
        order.description or meta.get("description", ""),          # 16 Dien giai
        meta.get("order_type", ""),                                 # 17 Loai don hang
        meta.get("credit_days", ""),                                # 18 So ngay duoc no
        delivery_date_str,                                          # 19 Han giao hang
        meta.get("payment_due", ""),                                # 20 Han thanh toan
        meta.get("status", "Chua thuc hien"),                       # 21 Tinh trang
        meta.get("record_date", ""),                                # 22 Ngay ghi so
        meta.get("actual_revenue", ""),                             # 23 Thuc thu
        meta.get("delivery_status", ""),                            # 24 Tinh trang giao hang
        meta.get("expected_expense", ""),                           # 25 Du kien chi
        meta.get("payment_status", "Chua thanh toan"),              # 26 Tinh trang thanh toan
        meta.get("production_deadline", ""),                        # 27 Han san xuat
        meta.get("invoice_issued", ""),                             # 28 Da xuat hoa don
        meta.get("invoice_customer", partner_name),                 # 29 Khach hang (Hoa don)
        meta.get("invoice_buyer", ""),                              # 30 Nguoi mua hang
        meta.get("invoice_country", "Viet Nam"),                    # 31 Quoc gia (Hoa don)
        meta.get("invoice_city", ""),                               # 32 Tinh/Thanh pho (Hoa don)
        meta.get("invoice_district", ""),                           # 33 Quan/Huyen (Hoa don)
        meta.get("invoice_ward", ""),                               # 34 Phuong/Xa (Hoa don)
        meta.get("invoice_street", ""),                             # 35 So nha Duong pho (Hoa don)
        meta.get("invoice_area_code", ""),                          # 36 Ma vung (Hoa don)
        meta.get("invoice_address", ""),                            # 37 Dia chi (Hoa don)
        meta.get("invoice_cluster", ""),                            # 38 Phan cum hoa don
        meta.get("delivery_receiver", ""),                          # 39 Nguoi nhan hang
        meta.get("delivery_phone", ""),                             # 40 Dien thoai
        meta.get("delivery_country", "Viet Nam"),                   # 41 Quoc gia (Giao hang)
        meta.get("delivery_city", ""),                              # 42 Tinh/Thanh pho (Giao hang)
        meta.get("delivery_district", ""),                          # 43 Quan/Huyen (Giao hang)
        meta.get("delivery_ward", ""),                              # 44 Phuong/Xa (Giao hang)
        meta.get("delivery_street", addr_text),                     # 45 So nha Duong pho (Giao hang)
        meta.get("delivery_area_code", ""),                         # 46 Ma vung (Giao hang)
        meta.get("delivery_address", addr_text),                    # 47 Dia chi (Giao hang)
        meta.get("note_description", ""),                           # 48 Mo ta
        meta.get("invoice_note", ""),                               # 49 Ghi chu Hoa don
        meta.get("executor", ""),                                   # 50 Nguoi thuc hien
        meta.get("shared", ""),                                     # 51 Dung chung
        "",                                                         # 52 Ngung theo doi
        meta.get("referral_partner", ""),                           # 53 Doi tac/CTV gioi thieu
        meta.get("sync_price_after_discount", ""),                  # 54 Dong bo don gia sau CK
        meta.get("sales_project", ""),                              # 55 Du an ban hang
        meta.get("origin", ""),                                     # 56 Nguon goc
        meta.get("warehouse_staff", ""),                            # 57 Nhan vien kho
        meta.get("delivery_staff", ""),                             # 58 Nhan vien giao hang
        meta.get("expected_delivery_date", ""),                     # 59 Ngay giao du kien
        meta.get("shipping_route", ""),                             # 60 Tuyen van chuyen
        meta.get("actual_expense", ""),                             # 61 Thuc chi
    ]
    for col, v in enumerate(vals1, 1):
        ws1.cell(row=2, column=col, value=v)

    # Sheet 2: hang hoa
    ws2 = wb.create_sheet("nhập khẩu hàng hóa")
    hdrs2 = [
        "Mã hàng hóa", "Số lượng", "Diễn giải", "Đơn vị tính",
        "Đơn giá", "Thành tiền", "Tỷ lệ chiết khấu", "Tiền chiết khấu",
        "Thuế suất", "Tiền thuế", "Tổng tiền", "Ghi chú", "Hàng KM", "Đơn hàng (*)",
    ]
    widths2 = [13.27, 9.45, 23.54, 11.54, 8.45, 11.27, 16.27, 15.82, 10.54, 10.27, 13.0, 8.45, 10.73, 13.27]
    for col, h in enumerate(hdrs2, 1):
        cell = ws2.cell(row=1, column=col, value=h)
        cell.font = hfont
        ws2.column_dimensions[get_column_letter(col)].width = widths2[col - 1]

    order_ref = order.order_number or ""
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
        ws2.cell(row=idx, column=1, value=product_code)
        ws2.cell(row=idx, column=2, value=qty)
        ws2.cell(row=idx, column=3, value=product_name)
        ws2.cell(row=idx, column=4, value=uom)
        ws2.cell(row=idx, column=5, value=price)
        ws2.cell(row=idx, column=6, value=amount)
        ws2.cell(row=idx, column=7, value=dk_rate)
        ws2.cell(row=idx, column=8, value=dk_amt)
        ws2.cell(row=idx, column=9, value=f"{int(tax_rate)}%" if tax_rate else None)
        ws2.cell(row=idx, column=10, value=tax_amt)
        ws2.cell(row=idx, column=11, value=total)
        ws2.cell(row=idx, column=14, value=order_ref)

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
