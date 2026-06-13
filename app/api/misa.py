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


# ── Price Books (Bảng giá / Chiết khấu — đọc từ data/pricebooks.json) ────────

@router.get("/price-books")
def list_price_books():
    from app.services.misa_pricebook import get_pricebook_list
    return get_pricebook_list()


@router.get("/price-books/all")
def all_pricebook_details():
    from app.services.misa_pricebook import get_all_pricebook_details
    return get_all_pricebook_details()


@router.get("/price-books/for-customers")
def pricebooks_for_customers(codes: str = Query("")):
    """
    Return pricebooks keyed by customer_code.
    `codes` = comma-separated list of customer codes.
    Returns { customer_code: [pricebook, ...] }
    """
    from app.services.misa_pricebook import get_pricebooks_for_customers
    if not codes:
        return {}
    code_list = [c.strip() for c in codes.split(",") if c.strip()]
    return get_pricebooks_for_customers(code_list)


@router.get("/price-books/{pb_code}")
def get_pricebook(pb_code: str):
    from app.services.misa_pricebook import get_pricebook_by_code
    data = get_pricebook_by_code(pb_code)
    if data is None:
        raise HTTPException(status_code=404, detail=f"PriceBook {pb_code} not found")
    return data


# ── Account ───────────────────────────────────────────────────────────────────

@router.get("/account/token")
def refresh_token():
    """Kiểm tra kết nối và refresh token MISA."""
    _call(misa_client.get_token_info)
    app_id, _ = misa_client.get_credentials()
    return {
        "success": True,
        "app_id": app_id,
        "message": f"Token refreshed successfully for {app_id}",
    }


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

    # ── Kiểm tra PO number trùng ────────────────────────────────────────────
    if order.po_number:
        from app.models.po_history import POHistory
        existing_po = db.query(POHistory).filter(POHistory.po_number == order.po_number.strip()).first()
        if existing_po:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Số PO '{order.po_number}' đã được đẩy lên MISA trước đó"
                    + (f" (Đơn {existing_po.sale_order_no})" if existing_po.sale_order_no else "")
                    + (f" cho KH {existing_po.customer_name or existing_po.customer_code}" if existing_po.customer_code else "")
                    + ". Xóa bản ghi trong PO History nếu muốn đẩy lại."
                ),
            )

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
        "owner_name": meta.get("executor") or meta.get("owner") or None,
        "recorded_sale_users_name": meta.get("salesperson", "KM1989-Nguyễn Văn Ân"),
        "custom_field4": meta.get("salesperson", "KM1989-Nguyễn Văn Ân"),
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
        "custom_field3": order.po_number or "",
    }

    try:
        result = misa_client.create_sale_orders([payload])
        misa_cache.invalidate('sale_orders')

        # ── Ghi PO history sau khi push thành công ──────────────────────────
        if order.po_number:
            from app.models.po_history import POHistory
            meta_data: dict = order.extra_data or {}
            db.add(POHistory(
                po_number=order.po_number.strip(),
                order_id=order.id,
                customer_code=meta_data.get("customer_code") or (partner.code if partner else None),
                customer_name=meta_data.get("customer_name") or (partner.legal_name if partner else None),
                sale_order_no=next_no,
            ))
            db.commit()

        return {**result, "sale_order_no": next_no}
    except HTTPException:
        raise
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Push: local order → MISA Kế toán (Đơn mua hàng / ĐMH) ────────────────────

def _find_order_or_bill(db: Session, doc_id):
    """Tìm theo id trong cả ProcessedOrder lẫn ProcessedBill (page Export hóa đơn
    xử lý cả hai — hiện tại chủ yếu là hóa đơn GTGT = ProcessedBill)."""
    from app.models.document import ProcessedOrder, ProcessedBill
    obj = db.query(ProcessedOrder).filter(ProcessedOrder.id == doc_id).first()
    if obj:
        return obj
    return db.query(ProcessedBill).filter(ProcessedBill.id == doc_id).first()


@router.get("/invoice-docs/{session_id}")
def list_invoice_docs(session_id: str, db: Session = Depends(get_db)):
    """
    Danh sách chứng từ của 1 session cho màn "Export hóa đơn": gộp cả
    ProcessedOrder (đơn mua hàng) và ProcessedBill (hóa đơn GTGT). Trả về shape
    thống nhất để frontend render list + preview ĐMH.
    """
    from uuid import UUID
    from app.models.document import ProcessedOrder, ProcessedBill, RawDocument

    try:
        sid = UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session_id")

    raw_docs = db.query(RawDocument).filter(RawDocument.session_id == sid).all()
    raw_ids = [d.id for d in raw_docs]
    raw_by_id = {d.id: d for d in raw_docs}
    if not raw_ids:
        return {"processing_count": 0, "done_count": 0, "items": []}

    def _doc_out(obj, doc_type: str) -> dict:
        raw = raw_by_id.get(obj.raw_document_id)
        meta = obj.extra_data or {} if hasattr(obj, "extra_data") else {}
        return {
            "id": str(obj.id),
            "doc_type": doc_type,  # "order" | "bill"
            "file_name": raw.file_name if raw else None,
            "ref_no": getattr(obj, "po_number", None)
                       or getattr(obj, "order_number", None)
                       or getattr(obj, "invoice_number", None),
            "partner_name": (obj.partner.legal_name if getattr(obj, "partner", None) else None)
                            or meta.get("customer_name"),
            "total_amount": float(obj.total_amount) if obj.total_amount else None,
            "status": obj.status,
            "line_count": len(obj.lines),
        }

    items: list[dict] = []
    for o in db.query(ProcessedOrder).filter(ProcessedOrder.raw_document_id.in_(raw_ids)).all():
        items.append(_doc_out(o, "order"))
    for b in db.query(ProcessedBill).filter(ProcessedBill.raw_document_id.in_(raw_ids)).all():
        items.append(_doc_out(b, "bill"))

    processing_count = sum(1 for d in raw_docs if d.ocr_status in ("pending", "processing"))
    done_count = sum(1 for d in raw_docs if d.ocr_status == "done")
    return {"processing_count": processing_count, "done_count": done_count, "items": items}


@router.get("/purchase-order/{order_id}/payload")
def get_purchase_order_payload(order_id: str, db: Session = Depends(get_db)):
    """
    Dựng payload "Đơn mua hàng" (ĐMH) từ một đơn/hóa đơn đã review và trả về
    (không gửi đi đâu, không ghi gì). Dùng cho preview + nút "Tải JSON".
    """
    from uuid import UUID
    from app.services.po_payload_builder import build_purchase_order_payload

    try:
        oid = UUID(order_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid order_id")

    obj = _find_order_or_bill(db, oid)
    if not obj:
        raise HTTPException(status_code=404, detail="Document not found")

    return build_purchase_order_payload(obj, db)


@router.post("/push/purchase-order/{order_id}")
def push_purchase_order_to_misa(order_id: str, db: Session = Depends(get_db)):
    """
    Lấy đơn đã review từ DB, build payload "Đơn mua hàng" (ĐMH) và gửi lên MISA
    Kế toán. Khi chưa cấu hình API Kế toán → dry-run: ghi JSON ra
    data/po_payloads/<DMH>.json (xem misa_accounting_client).
    """
    from uuid import UUID
    from app.models.document import ProcessedOrder
    from app.models.partner import Partner
    from app.services.misa_accounting_client import misa_accounting_client
    from app.services.po_payload_builder import build_purchase_order_payload

    try:
        oid = UUID(order_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid order_id")

    order = db.query(ProcessedOrder).filter(ProcessedOrder.id == oid).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # ── Kiểm tra PO number trùng (dùng chung POHistory với luồng SaleOrders) ──
    if order.po_number:
        from app.models.po_history import POHistory
        existing_po = db.query(POHistory).filter(POHistory.po_number == order.po_number.strip()).first()
        if existing_po:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Số PO '{order.po_number}' đã được đẩy lên MISA trước đó"
                    + (f" (Đơn {existing_po.sale_order_no})" if existing_po.sale_order_no else "")
                    + (f" cho {existing_po.customer_name or existing_po.customer_code}" if existing_po.customer_code else "")
                    + ". Xóa bản ghi trong PO History nếu muốn đẩy lại."
                ),
            )

    payload = build_purchase_order_payload(order, db)
    next_no = payload["no"]

    try:
        result = misa_accounting_client.create_purchase_order(payload)
        if not result.get("success"):
            raise HTTPException(status_code=502, detail=result.get("message") or "MISA Kế toán từ chối đơn")

        # ── Ghi PO history sau khi thành công ───────────────────────────────
        if order.po_number:
            from app.models.po_history import POHistory
            partner = db.query(Partner).filter(Partner.id == order.partner_id).first() if order.partner_id else None
            meta: dict = order.extra_data or {}
            db.add(POHistory(
                po_number=order.po_number.strip(),
                order_id=order.id,
                customer_code=meta.get("customer_code") or (partner.code if partner else None),
                customer_name=meta.get("customer_name") or (partner.legal_name if partner else None),
                sale_order_no=next_no,
            ))
            db.commit()

        return {**result, "purchase_order_no": next_no}
    except HTTPException:
        raise
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Sync: MISA → local DB ─────────────────────────────────────────────────────

@router.post("/sync/customers")
def sync_customers(db: Session = Depends(get_db)):
    """Kéo toàn bộ khách hàng từ MISA về DB local, tự động cập nhật customers.json."""
    result = _call(misa_sync.sync_customers, db)
    try:
        from app.api.partners import export_customers_json
        export_customers_json(db)
    except Exception:
        pass
    return result


@router.post("/sync/products")
def sync_products(db: Session = Depends(get_db)):
    """Kéo toàn bộ hàng hóa từ MISA về DB local (upsert theo mã HH)."""
    return _call(misa_sync.sync_products, db)


@router.post("/sync/contacts")
def sync_contacts(db: Session = Depends(get_db)):
    """Kéo toàn bộ liên hệ từ MISA về DB local (upsert theo mã LH)."""
    return _call(misa_sync.sync_contacts, db)
