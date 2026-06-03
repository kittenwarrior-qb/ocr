from typing import Any, List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import misa_cache, misa_sync
from app.services.misa_client import misa_client

router = APIRouter(prefix="/misa", tags=["MISA CRM"])


def _call(fn, *args, **kwargs) -> Any:
    try:
        return fn(*args, **kwargs)
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Price Books (Bảng giá / Chiết khấu — đọc từ JSON tĩnh) ──────────────────

@router.get("/price-books")
def list_price_books():
    from app.services.misa_pricebook import get_pricebook_list
    return get_pricebook_list()


@router.get("/price-books/all")
def all_pricebook_details():
    from app.services.misa_pricebook import get_all_pricebook_details
    return get_all_pricebook_details()


@router.get("/price-books/{pb_id}")
def get_pricebook(pb_id: int):
    from app.services.misa_pricebook import get_pricebook_by_id
    data = get_pricebook_by_id(pb_id)
    if data is None:
        raise HTTPException(status_code=404, detail=f"PriceBook {pb_id} not found")
    return data


# ── Giảm giá / Khuyến mãi ────────────────────────────────────────────────────

@router.get("/promotions")
def list_promotions():
    from app.services.misa_pricebook import get_giamgia_list
    return get_giamgia_list()


@router.get("/promotions/all")
def all_promotion_details():
    from app.services.misa_pricebook import get_all_giamgia_details
    return get_all_giamgia_details()


@router.get("/promotions/{gid}")
def get_promotion(gid: int):
    from app.services.misa_pricebook import get_giamgia_by_id
    data = get_giamgia_by_id(gid)
    if data is None:
        raise HTTPException(status_code=404, detail=f"Promotion {gid} not found")
    return data


# ── Account ───────────────────────────────────────────────────────────────────

@router.get("/account/token")
def refresh_token():
    """Kiểm tra kết nối và refresh token MISA."""
    _call(misa_client.get_token_info)
    return {"success": True, "message": "Token refreshed successfully"}


# ── Contacts ─────────────────────────────────────────────────────────────────

@router.get("/contacts")
def list_contacts(
    page: int = 0,
    pageSize: int = 10,
    orderBy: str = "modified_date",
    isDescending: bool = True,
):
    return _call(misa_client.list_contacts, page, pageSize, orderBy, isDescending)


@router.get("/contacts/id")
def get_contacts_by_id(ids: List[int] = Query(...)):
    return _call(misa_client.get_contacts_by_id, ids)


@router.get("/contacts/code")
def get_contacts_by_code(code: List[str] = Query(...)):
    return _call(misa_client.get_contacts_by_code, code)


@router.post("/contacts")
def create_contacts(data: List[dict]):
    return _call(misa_client.create_contacts, data)


@router.put("/contacts")
def update_contacts(data: List[dict]):
    return _call(misa_client.update_contacts, data)


@router.delete("/contacts")
def delete_contacts(ids: List[int]):
    return _call(misa_client.delete_contacts, ids)


# ── Customers ─────────────────────────────────────────────────────────────────

@router.get("/customers")
def list_customers(
    page: int = 0,
    pageSize: int = 10,
    orderBy: str = "modified_date",
    isDescending: bool = True,
):
    return _call(misa_client.list_customers, page, pageSize, orderBy, isDescending)


@router.get("/customers/id")
def get_customers_by_id(ids: List[int] = Query(...)):
    return _call(misa_client.get_customers_by_id, ids)


@router.get("/customers/code")
def get_customers_by_code(code: List[str] = Query(...)):
    return _call(misa_client.get_customers_by_code, code)


@router.post("/customers")
def create_customers(data: List[dict]):
    return _call(misa_client.create_customers, data)


@router.put("/customers")
def update_customers(data: List[dict]):
    return _call(misa_client.update_customers, data)


@router.delete("/customers")
def delete_customers(ids: List[int]):
    return _call(misa_client.delete_customers, ids)


# ── Products ──────────────────────────────────────────────────────────────────

@router.get("/products")
def list_products(
    page: int = 0,
    pageSize: int = 10,
    orderBy: str = "modified_date",
    isDescending: bool = True,
):
    return _call(misa_client.list_products, page, pageSize, orderBy, isDescending)


@router.get("/products/id")
def get_products_by_id(ids: List[int] = Query(...)):
    return _call(misa_client.get_products_by_id, ids)


@router.get("/products/code")
def get_products_by_code(code: List[str] = Query(...)):
    return _call(misa_client.get_products_by_code, code)


@router.post("/products")
def create_products(data: List[dict]):
    return _call(misa_client.create_products, data)


@router.put("/products")
def update_products(data: List[dict]):
    return _call(misa_client.update_products, data)


@router.delete("/products")
def delete_products(ids: List[int]):
    return _call(misa_client.delete_products, ids)


# ── SaleOrders ────────────────────────────────────────────────────────────────

@router.get("/sale-orders")
def list_sale_orders(
    page: int = 0,
    pageSize: int = 10,
    orderBy: str = "modified_date",
    isDescending: bool = True,
):
    return _call(misa_client.list_sale_orders, page, pageSize, orderBy, isDescending)


@router.get("/sale-orders/id")
def get_sale_orders_by_id(ids: List[int] = Query(...)):
    return _call(misa_client.get_sale_orders_by_id, ids)


@router.get("/sale-orders/code")
def get_sale_orders_by_code(code: List[str] = Query(...)):
    return _call(misa_client.get_sale_orders_by_code, code)


@router.post("/sale-orders")
def create_sale_orders(data: List[dict]):
    return _call(misa_client.create_sale_orders, data)


@router.put("/sale-orders")
def update_sale_orders(data: List[dict]):
    return _call(misa_client.update_sale_orders, data)


@router.delete("/sale-orders")
def delete_sale_orders(ids: List[int]):
    return _call(misa_client.delete_sale_orders, ids)


# ── Stocks ────────────────────────────────────────────────────────────────────

@router.get("/stocks")
def list_stocks():
    return _call(misa_client.list_stocks)


@router.get("/stocks/code")
def get_stocks_by_code(stockCode: List[str] = Query(...)):
    return _call(misa_client.get_stocks_by_code, stockCode)


@router.get("/stocks/ledger")
def list_stock_ledger(
    page: int = 0,
    pageSize: int = 10,
    stockId: Optional[str] = None,
):
    return _call(misa_client.list_stock_ledger, page, pageSize, stockId)


@router.post("/stocks")
def create_stocks(data: List[dict]):
    return _call(misa_client.create_stocks, data)


@router.put("/stocks")
def update_stocks(data: List[dict]):
    return _call(misa_client.update_stocks, data)


@router.delete("/stocks")
def delete_stocks(ids: List[str]):
    return _call(misa_client.delete_stocks, ids)


@router.post("/stocks/ledger")
def update_stock_ledger(data: List[dict]):
    return _call(misa_client.update_stock_ledger, data)


# ── All-data (cached, dùng cho tab danh sách + search) ───────────────────────

@router.get("/customers/all")
def all_customers():
    """Trả toàn bộ KH từ MISA, cache 10 phút. Frontend gọi 1 lần duy nhất."""
    return _call(misa_cache.get_or_fetch, 'customers', misa_client.list_customers)


@router.get("/products/all")
def all_products():
    """Trả toàn bộ HH từ MISA, cache 10 phút."""
    return _call(misa_cache.get_or_fetch, 'products', misa_client.list_products)


@router.get("/contacts/all")
def all_contacts():
    """Trả toàn bộ LH từ MISA, cache 10 phút."""
    return _call(misa_cache.get_or_fetch, 'contacts', misa_client.list_contacts)


@router.get("/sale-orders/next-no")
def next_sale_order_no():
    """Trả về số đơn hàng DH tiếp theo dựa trên max hiện tại trên MISA."""
    import re
    try:
        all_orders = misa_cache.get_or_fetch('sale_orders', misa_client.list_sale_orders)
        max_num = 0
        for o in all_orders:
            m = re.match(r'^DH(\d+)$', str(o.get('sale_order_no') or ''))
            if m:
                max_num = max(max_num, int(m.group(1)))
        return {"next_no": f"DH{max_num + 1:07d}"}
    except Exception:
        return {"next_no": "DH0000001"}


@router.get("/sale-orders/all")
def all_sale_orders():
    """Trả toàn bộ đơn hàng từ MISA, cache 10 phút."""
    return _call(misa_cache.get_or_fetch, 'sale_orders', misa_client.list_sale_orders)


# ── Push: local order → MISA ─────────────────────────────────────────────────

@router.post("/push/orders/{order_id}")
def push_order_to_misa(order_id: str, db: Session = Depends(get_db)):
    """Lấy đơn hàng từ DB, build payload, đẩy lên MISA. Tự sinh số DH tiếp theo."""
    import re
    from uuid import UUID
    from app.models.document import ProcessedOrder
    from app.models.partner import Partner
    from app.models.product import Product

    try:
        oid = UUID(order_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid order_id")

    order = db.query(ProcessedOrder).filter(ProcessedOrder.id == oid).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # ── Auto-increment DH number ────────────────────────────────────────────
    try:
        all_orders = misa_cache.get_or_fetch('sale_orders', misa_client.list_sale_orders)
        max_num = 0
        for o in all_orders:
            m = re.match(r'^DH(\d+)$', str(o.get('sale_order_no') or ''))
            if m:
                max_num = max(max_num, int(m.group(1)))
        next_no = f"DH{max_num + 1:07d}"
    except Exception:
        next_no = "DH0000001"

    # ── Lookup partner & products ───────────────────────────────────────────
    partner = db.query(Partner).filter(Partner.id == order.partner_id).first() if order.partner_id else None
    meta: dict = order.extra_data or {}

    def date_fmt(d):
        return d.strftime("%Y-%m-%dT00:00:00.000+07:00") if d else None

    # ── Build line items ────────────────────────────────────────────────────
    lines_payload = []
    for line in order.lines:
        product = db.query(Product).filter(Product.id == line.product_id).first() if line.product_id else None
        product_code = (product.code if product else None) or getattr(line, 'ocr_product_code', None) or getattr(line, 'temp_code', '') or ''
        description = (product.display_name if product else None) or getattr(line, 'product_name_original', '') or ''
        uom = (product.uom if product else None) or getattr(line, 'uom_original', '') or ''
        qty = float(line.quantity or 0)
        price = float(line.unit_price or 0)
        to_currency = float(line.line_total or (qty * price))
        discount = float(getattr(line, 'discount_amount', None) or 0)
        tax_rate_num = float(line.tax_rate or 0)
        tax = round((to_currency - discount) * tax_rate_num / 100, 2)
        total = round(to_currency - discount + tax, 2)

        lines_payload.append({
            "product_code": product_code,
            "description": description,
            "amount": qty,
            "unit": uom,
            "price": str(int(price)) if price == int(price) else str(round(price, 2)),
            "to_currency": to_currency,
            "discount": discount,
            "tax_percent": f"{int(tax_rate_num)}%" if tax_rate_num else "0%",
            "tax": tax,
            "total": total,
        })

    total_summary = round(sum(l["to_currency"] for l in lines_payload), 2)
    discount_summary = round(sum(l["discount"] for l in lines_payload), 2)
    tax_summary = round(sum(l["tax"] for l in lines_payload), 2)
    to_currency_summary = round(total_summary - discount_summary, 2)
    sale_order_amount = round(to_currency_summary + tax_summary, 2)

    payload = {
        "sale_order_no": next_no,
        "form_layout": "Mẫu tiêu chuẩn",
        "sale_order_name": meta.get("note_description") or (
            f"Đơn hàng bán cho {meta.get('customer_name') or meta.get('name') or meta.get('invoice_customer') or ''}"
        ).strip() or f"Đơn hàng {next_no}",
        "sale_order_date": date_fmt(order.order_date),
        "book_date": date_fmt(order.order_date),
        "due_date": meta.get("payment_due") or date_fmt(order.order_date),
        "status": "Chưa thực hiện",
        "sale_order_type": meta.get("order_type") or "Kênh MT",
        "account_name": meta.get("customer_code") or (partner.code if partner else "") or "",
        "contact_name": meta.get("contact_code") or meta.get("contact") or "",
        "owner_name": meta.get("owner") or meta.get("customer_owner") or None,
        "phone": meta.get("delivery_phone") or (partner.phone if partner else "") or "",
        "billing_country": meta.get("invoice_country") or "Việt Nam",
        "billing_address": meta.get("invoice_address") or "",
        "shipping_country": meta.get("delivery_country") or "Việt Nam",
        "shipping_address": meta.get("delivery_address") or "",
        "total_summary": total_summary,
        "discount_summary": discount_summary,
        "tax_summary": tax_summary,
        "to_currency_summary": to_currency_summary,
        "sale_order_amount": sale_order_amount,
        "liquidate_amount": sale_order_amount,
        "sale_order_product_mappings": lines_payload,
    }

    try:
        result = misa_client.create_sale_orders([payload])
        misa_cache.invalidate('sale_orders')
        return {**result, "sale_order_no": next_no}
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Sync: MISA → local DB ─────────────────────────────────────────────────────

@router.post("/sync/customers")
def sync_customers(db: Session = Depends(get_db)):
    """Kéo toàn bộ khách hàng từ MISA về DB local (upsert theo mã KH)."""
    return _call(misa_sync.sync_customers, db)


@router.post("/sync/products")
def sync_products(db: Session = Depends(get_db)):
    """Kéo toàn bộ hàng hóa từ MISA về DB local (upsert theo mã HH)."""
    return _call(misa_sync.sync_products, db)


@router.post("/sync/contacts")
def sync_contacts(db: Session = Depends(get_db)):
    """Kéo toàn bộ liên hệ từ MISA về DB local (upsert theo mã LH)."""
    return _call(misa_sync.sync_contacts, db)
