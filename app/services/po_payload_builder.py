"""
Build payload "Đơn mua hàng" (ĐMH) cho MISA Kế toán từ một ProcessedOrder.

Tách phần tính toán dòng hàng + tổng tiền (vốn nằm inline trong
app.api.misa.push_order_to_misa) ra đây để dùng lại được, nhưng xuất ra tên key
khớp với form ĐMH (xem bảng mapping trong plan). Builder SaleOrders (CRM) giữ
nguyên — file này chỉ phục vụ luồng Đơn mua hàng Kế toán.
"""
import re
from datetime import date as _date
from uuid import uuid4

from sqlalchemy.orm import Session

from app.models.document import ProcessedOrder, ProcessedBill
from app.models.partner import Partner
from app.models.product import Product


def _date_fmt(d: _date | None) -> str | None:
    return d.strftime("%Y-%m-%d") if d else None


def next_purchase_order_no(db: Session) -> str:
    """
    Sinh số Đơn mua hàng tiếp theo dạng DMH%07d dựa trên max po_number kiểu DMH…
    đã ghi trong POHistory. Tương tự next_sale_order_no (app/api/misa.py:285)
    nhưng cho prefix DMH thay vì DH.
    """
    from app.models.po_history import POHistory

    max_num = 0
    rows = db.query(POHistory.sale_order_no).all()
    for (no,) in rows:
        m = re.match(r"^DMH(\d+)$", str(no or ""))
        if m:
            max_num = max(max_num, int(m.group(1)))
    return f"DMH{max_num + 1:07d}"


def build_purchase_order_payload(order: "ProcessedOrder | ProcessedBill", db: Session) -> dict:
    """
    Dựng payload ĐMH (dict thuần) từ một ProcessedOrder HOẶC ProcessedBill đã
    review. Hai model dùng chung field tiền/dòng hàng nên builder duck-type được;
    chỉ khác tên field định danh (order_number/order_date ↔ invoice_number/
    invoice_date) — xử lý bằng getattr fallback bên dưới.

    Phần tính tiền (amount/discount/vat/total mỗi dòng và tổng) khớp 1-1 với
    push_order_to_misa để hai luồng cho ra cùng con số trên cùng một đơn.
    """
    meta: dict = getattr(order, "extra_data", None) or {}
    order_date = getattr(order, "order_date", None) or getattr(order, "invoice_date", None)
    delivery_date = getattr(order, "delivery_date", None)
    doc_ref = getattr(order, "order_number", None) or getattr(order, "invoice_number", None)
    partner = (
        db.query(Partner).filter(Partner.id == order.partner_id).first()
        if order.partner_id
        else None
    )

    # ── Dòng hàng (Hàng tiền) ────────────────────────────────────────────────
    # OCR đôi khi không bắt được thuế suất ở từng dòng (tax_rate=null) dù tổng
    # thuế ở header vẫn đúng (vd hóa đơn GTGT 1 mức thuế). Suy ra % thuế hiệu dụng
    # từ header (tax_amount / tiền hàng trước thuế) để dùng làm fallback cho dòng
    # nào thiếu — giữ nguyên giá trị dòng khi OCR đã bắt được.
    header_tax = float(getattr(order, "tax_amount", None) or 0)
    header_base = sum(
        float(l.line_total or 0) - float(getattr(l, "discount_amount", None) or 0)
        for l in order.lines
    )
    fallback_rate = 0.0
    if header_tax > 0 and header_base > 0:
        fallback_rate = round(header_tax / header_base * 100, 2)

    lines_payload: list[dict] = []
    for idx, line in enumerate(order.lines, start=1):
        product = (
            db.query(Product).filter(Product.id == line.product_id).first()
            if line.product_id
            else None
        )
        item_code = (
            (product.code if product else None)
            or getattr(line, "ocr_product_code", None)
            or getattr(line, "temp_code", "")
            or ""
        )
        item_name = (
            (product.display_name if product else None)
            or getattr(line, "product_name_original", "")
            or ""
        )
        unit = (product.uom if product else None) or getattr(line, "uom_original", "") or ""

        qty = float(line.quantity or 0)
        price = float(line.unit_price or 0)
        amount = float(line.line_total or (qty * price))
        discount = float(getattr(line, "discount_amount", None) or 0)
        vat_rate = float(line.tax_rate or 0) or fallback_rate
        vat_amount = round((amount - discount) * vat_rate / 100, 2)
        total = round(amount - discount + vat_amount, 2)

        lines_payload.append({
            "line_no": idx,
            "item_code": item_code,
            "item_name": item_name,
            "unit": unit,
            "quantity": qty,
            "unit_price": price,
            "amount": amount,
            "discount_amount": discount,
            "vat_rate": f"{int(vat_rate)}%" if vat_rate == int(vat_rate) else f"{vat_rate}%",
            "vat_amount": vat_amount,
            "total": total,
        })

    # ── Tổng tiền (panel bên phải) ───────────────────────────────────────────
    total_amount = round(sum(l["amount"] for l in lines_payload), 2)
    discount_amount = round(sum(l["discount_amount"] for l in lines_payload), 2)
    vat_amount = round(sum(l["vat_amount"] for l in lines_payload), 2)
    total_payment = round(total_amount - discount_amount + vat_amount, 2)

    return {
        "ref_id": str(uuid4()),
        "no": next_purchase_order_no(db),
        "date": _date_fmt(order_date),
        "delivery_date": _date_fmt(delivery_date),
        "source_ref": doc_ref or "",
        # Đối tượng = nhà cung cấp (NCC). Pipeline mapping hiện resolve theo KH;
        # người dùng đã xác nhận/sửa lại ở bước review trước khi gọi tới đây.
        "object_code": meta.get("customer_code") or (partner.code if partner else "") or "",
        "object_name": (
            meta.get("customer_name")
            or (partner.legal_name if partner else None)
            or meta.get("name")
            or ""
        ),
        "tax_code": meta.get("customer_tax_code") or (partner.tax_code if partner else "") or "",
        "object_address": meta.get("invoice_address") or (partner.address if partner else "") or "",
        "contact_name": meta.get("contact") or getattr(order, "recipient_name", None) or "",
        "phone": meta.get("phone") or meta.get("delivery_phone") or (partner.phone if partner else "") or "",
        "journal_memo": getattr(order, "description", None) or meta.get("description") or "",
        "status": meta.get("status") or "Chưa thực hiện",
        "employee_code": meta.get("salesperson") or meta.get("executor") or "",
        "ref_no": getattr(order, "po_number", None) or doc_ref or "",
        "currency": getattr(order, "currency", None) or "VND",
        "total_amount": total_amount,
        "discount_amount": discount_amount,
        "vat_amount": vat_amount,
        "total_payment": total_payment,
        "lines": lines_payload,
    }
