from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.document import BillLine, OrderLine
from app.models.mapping import TempCodeMapping
from app.schemas.document import MapTempCodeRequest, TempCodeMappingOut
from app.services import mapping_service
from app.services.sku_alias_service import upsert_alias
from app.models.product import Product

router = APIRouter(prefix="/mappings", tags=["Mappings"])


def _enrich_mappings(db: Session, mappings: list[TempCodeMapping]) -> list[dict]:
    if not mappings:
        return []
    temp_codes = [m.temp_code for m in mappings]

    order_names = (
        db.query(OrderLine.temp_code, OrderLine.product_name_original,
                 func.count(OrderLine.id).label("cnt"))
        .filter(OrderLine.temp_code.in_(temp_codes))
        .group_by(OrderLine.temp_code, OrderLine.product_name_original)
        .all()
    )
    bill_names = (
        db.query(BillLine.temp_code, BillLine.product_name_original,
                 func.count(BillLine.id).label("cnt"))
        .filter(BillLine.temp_code.in_(temp_codes))
        .group_by(BillLine.temp_code, BillLine.product_name_original)
        .all()
    )

    name_map: dict[str, tuple[str, int]] = {}
    for tc, name, cnt in list(order_names) + list(bill_names):
        existing_name, existing_cnt = name_map.get(tc, ("", 0))
        if cnt > existing_cnt:
            name_map[tc] = (name, existing_cnt + cnt)
        else:
            name_map[tc] = (existing_name, existing_cnt + cnt)

    result = []
    for m in mappings:
        sample_name, occ = name_map.get(m.temp_code, ("", 0))
        result.append({
            "id": m.id,
            "temp_code": m.temp_code,
            "product_id": m.product_id,
            "status": m.status,
            "first_seen_at": m.first_seen_at,
            "last_used_at": m.last_used_at,
            "sample_name": sample_name,
            "occurrence_count": occ,
        })
    return result


@router.get("/pending")
def list_pending_mappings(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    mappings = (
        db.query(TempCodeMapping)
        .filter(TempCodeMapping.status == "pending")
        .order_by(TempCodeMapping.last_used_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return _enrich_mappings(db, mappings)


@router.get("/all")
def list_all_mappings(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    mappings = (
        db.query(TempCodeMapping)
        .order_by(TempCodeMapping.last_used_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return _enrich_mappings(db, mappings)


@router.get("/{temp_code}/impact")
def get_temp_code_impact(temp_code: str, db: Session = Depends(get_db)):
    """
    Trả về số đơn/hóa đơn (chưa xuất) sẽ bị cập nhật RETROACTIVE nếu áp dụng
    mapping temp_code này — để FE hiển thị cảnh báo phạm vi ảnh hưởng cho người
    dùng xác nhận trước khi map (map sai sẽ ghi đè dữ liệu hàng loạt đơn cũ).
    """
    return mapping_service.count_temp_code_impact(db, temp_code)


@router.post("/{temp_code}/map")
def map_temp_code(
    temp_code: str,
    body: MapTempCodeRequest,
    db: Session = Depends(get_db),
):
    if body.product_id:
        product = db.query(Product).filter(Product.id == body.product_id).first()
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        product_id = product.id

    elif body.product_code:
        product = db.query(Product).filter(Product.code == body.product_code).first()
        if not product:
            # Product not in DB yet — create it from the provided code
            if body.new_product_name and body.new_product_uom:
                product = Product(
                    code=body.product_code,
                    display_name=body.new_product_name,
                    uom=body.new_product_uom,
                )
                db.add(product)
                db.flush()
            else:
                raise HTTPException(status_code=404, detail=f"Product with code '{body.product_code}' not found")
        product_id = product.id

    elif body.new_product_name and body.new_product_uom:
        product = mapping_service.create_product_and_map(
            db, temp_code, body.new_product_name, body.new_product_uom
        )
        db.commit()
        return {
            "message": "New product created and mapped",
            "product_id": str(product.id),
            "product_code": product.code,
            "lines_updated": 0,
        }

    else:
        raise HTTPException(
            status_code=400,
            detail="Provide product_id, product_code, or new_product_name + new_product_uom",
        )

    updated = mapping_service.map_temp_code_to_product(db, temp_code, product_id)

    # Auto-learn: save alias (external_name, customer_code) → product_code
    from app.models.document import OrderLine, ProcessedOrder
    line = db.query(OrderLine).filter(OrderLine.temp_code == temp_code).first()
    sample_name = (line.product_name_original if line and line.product_name_original
                   else body.new_product_name or temp_code)
    # Extract customer_code from the order's extra_data
    customer_code = None
    if line:
        order = db.query(ProcessedOrder).filter(ProcessedOrder.id == line.processed_order_id).first()
        if order and order.extra_data:
            customer_code = order.extra_data.get("customer_code") or None
        # Also try contact_code
        contact_code = order.extra_data.get("contact_code") if order and order.extra_data else None
    else:
        contact_code = None
    upsert_alias(
        db,
        external_key=sample_name,
        product_code=product.code,
        customer_code=customer_code,
        product_name=product.display_name or "",
        contact_code=contact_code,
        source="auto_learn",
    )

    db.commit()
    return {
        "message": "Mapping saved. Retroactive update applied.",
        "product_id": str(product_id),
        "lines_updated": updated,
    }


@router.get("/{temp_code}/suggestions")
def get_suggestions(temp_code: str, db: Session = Depends(get_db)):
    suggestions = mapping_service.suggest_product_matches(db, temp_code)
    return [
        {"id": str(p.id), "code": p.code, "display_name": p.display_name, "uom": p.uom}
        for p in suggestions
    ]
