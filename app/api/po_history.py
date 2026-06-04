from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.po_history import POHistory

router = APIRouter(prefix="/po-history", tags=["PO History"])


@router.get("")
def list_po_history(
    search: str = "",
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    q = db.query(POHistory).order_by(POHistory.created_at.desc())
    if search:
        q = q.filter(
            POHistory.po_number.ilike(f"%{search}%")
            | POHistory.customer_code.ilike(f"%{search}%")
            | POHistory.customer_name.ilike(f"%{search}%")
            | POHistory.sale_order_no.ilike(f"%{search}%")
        )
    total = q.count()
    items = q.offset(skip).limit(limit).all()
    return {
        "items": [
            {
                "id": str(r.id),
                "po_number": r.po_number,
                "order_id": str(r.order_id),
                "customer_code": r.customer_code or "",
                "customer_name": r.customer_name or "",
                "sale_order_no": r.sale_order_no or "",
                "created_at": r.created_at.isoformat() if r.created_at else "",
            }
            for r in items
        ],
        "total": total,
    }


@router.get("/check")
def check_po_duplicate(po_number: str = Query(...), db: Session = Depends(get_db)):
    """Kiểm tra PO number có bị trùng không."""
    if not po_number.strip():
        return {"duplicate": False}
    existing = db.query(POHistory).filter(
        POHistory.po_number == po_number.strip()
    ).first()
    if existing:
        return {
            "duplicate": True,
            "existing": {
                "po_number": existing.po_number,
                "customer_code": existing.customer_code or "",
                "customer_name": existing.customer_name or "",
                "sale_order_no": existing.sale_order_no or "",
                "created_at": existing.created_at.isoformat() if existing.created_at else "",
            },
        }
    return {"duplicate": False}


@router.post("/backfill")
def backfill_po_history(db: Session = Depends(get_db)):
    """
    Quét toàn bộ đơn hàng từ MISA (custom_field3 = PO number) + processed_orders
    rồi lưu vào po_history. Bỏ qua trùng.
    """
    existing = {r.po_number for r in db.query(POHistory.po_number).all()}
    inserted = 0

    # ── 1. Từ MISA sale orders (custom_field3) ───────────────────────────────
    try:
        from app.services import misa_cache
        from app.services.misa_client import misa_client
        misa_orders = misa_cache.get_or_fetch('sale_orders', misa_client.list_sale_orders)
        for o in misa_orders:
            po = (o.get("custom_field3") or "").strip()
            if not po or po in existing:
                continue
            db.add(POHistory(
                po_number=po,
                order_id=None,
                customer_code=o.get("account_code") or "",
                customer_name=o.get("account_name") or "",
                sale_order_no=o.get("sale_order_no") or "",
            ))
            existing.add(po)
            inserted += 1
    except Exception as e:
        pass  # MISA không khả dụng → bỏ qua, vẫn chạy phần local

    # ── 2. Từ processed_orders local (po_number field) ───────────────────────
    from app.models.document import ProcessedOrder
    local_orders = db.query(ProcessedOrder).filter(
        ProcessedOrder.po_number.isnot(None),
        ProcessedOrder.po_number != "",
    ).all()
    for order in local_orders:
        po = (order.po_number or "").strip()
        if not po or po in existing:
            continue
        meta: dict = order.extra_data or {}
        db.add(POHistory(
            po_number=po,
            order_id=order.id,
            customer_code=meta.get("customer_code") or "",
            customer_name=meta.get("customer_name") or "",
            sale_order_no=order.order_number or "",
        ))
        existing.add(po)
        inserted += 1

    db.commit()
    return {"inserted": inserted}


@router.delete("/{po_id}")
def delete_po_history(po_id: str, db: Session = Depends(get_db)):
    """Xóa 1 bản ghi PO history (dùng khi cần đẩy lại đơn trùng)."""
    rec = db.query(POHistory).filter(POHistory.id == po_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Không tìm thấy bản ghi")
    db.delete(rec)
    db.commit()
    return {"deleted": po_id}
