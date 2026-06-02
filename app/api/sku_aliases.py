import csv
import io
import json
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.sku_alias import SkuAlias
from app.services.sku_alias_service import upsert_alias, bulk_upsert, normalize_key

router = APIRouter(prefix="/sku-aliases", tags=["SkuAliases"])


@router.get("/temp-mappings")
def list_temp_mappings(
    search: str = "",
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    """Return TempCodeMapping (the actual auto-map dictionary) with product info."""
    from app.models.mapping import TempCodeMapping
    from app.models.document import OrderLine
    from app.models.product import Product
    from sqlalchemy import func

    q = db.query(TempCodeMapping)
    if search:
        q = q.filter(TempCodeMapping.temp_code.ilike(f"%{search}%"))

    total = q.count()
    mappings = q.order_by(TempCodeMapping.last_used_at.desc()).offset(skip).limit(limit).all()

    # Get sample OCR names from order lines
    temp_codes = [m.temp_code for m in mappings]
    name_rows = (
        db.query(OrderLine.temp_code, OrderLine.product_name_original,
                 func.count(OrderLine.id).label("cnt"))
        .filter(OrderLine.temp_code.in_(temp_codes))
        .group_by(OrderLine.temp_code, OrderLine.product_name_original)
        .all()
    )
    name_map: dict[str, str] = {}
    cnt_map: dict[str, int] = {}
    for tc, name, cnt in name_rows:
        if cnt > cnt_map.get(tc, 0):
            name_map[tc] = name
            cnt_map[tc] = cnt

    result = []
    for m in mappings:
        product = db.query(Product).filter(Product.id == m.product_id).first() if m.product_id else None
        result.append({
            "id": str(m.id),
            "temp_code": m.temp_code,
            "ocr_name": name_map.get(m.temp_code, ""),
            "product_code": product.code if product else "",
            "product_name": product.display_name if product else "",
            "status": m.status,
            "usage_count": cnt_map.get(m.temp_code, 0),
            "last_used_at": m.last_used_at.isoformat(),
        })
    return {"items": result, "total": total}


def _out(a: SkuAlias) -> dict:
    return {
        "id": str(a.id),
        "external_key": a.external_key,
        "external_normalized": a.external_normalized,
        "customer_code": a.customer_code or "",
        "product_code": a.product_code,
        "product_name": a.product_name or "",
        "contact_code": a.contact_code or "",
        "source": a.source,
        "note": a.note or "",
        "created_at": a.created_at.isoformat(),
        "updated_at": a.updated_at.isoformat(),
    }


@router.get("")
def list_aliases(
    search: str = "",
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    q = db.query(SkuAlias)
    if search:
        norm = normalize_key(search)
        q = q.filter(
            SkuAlias.external_normalized.ilike(f"%{norm}%")
            | SkuAlias.product_code.ilike(f"%{search}%")
            | SkuAlias.product_name.ilike(f"%{search}%")
        )
    total = q.count()
    items = q.order_by(SkuAlias.updated_at.desc()).offset(skip).limit(limit).all()
    return {"items": [_out(a) for a in items], "total": total}


@router.get("/preload")
def preload_aliases(db: Session = Depends(get_db)):
    """Return all aliases for frontend in-memory cache (up to 10k rows)."""
    items = db.query(SkuAlias).order_by(SkuAlias.updated_at.desc()).limit(10000).all()
    return [
        {
            "external_normalized": a.external_normalized,
            "customer_code": a.customer_code or "",
            "product_code": a.product_code,
            "product_name": a.product_name or "",
            "contact_code": a.contact_code or "",
            "updated_at": a.updated_at.isoformat(),
        }
        for a in items
    ]


@router.post("")
def create_alias(body: dict, db: Session = Depends(get_db)):
    key = (body.get("external_key") or "").strip()
    code = (body.get("product_code") or "").strip()
    if not key or not code:
        raise HTTPException(400, "external_key and product_code required")
    alias = upsert_alias(
        db,
        external_key=key,
        product_code=code,
        customer_code=(body.get("customer_code") or None),
        product_name=(body.get("product_name") or "").strip(),
        contact_code=(body.get("contact_code") or None),
        source=body.get("source", "manual"),
        note=(body.get("note") or "").strip(),
    )
    return _out(alias)


@router.delete("/temp/{mapping_id}")
def delete_temp_mapping(mapping_id: UUID, db: Session = Depends(get_db)):
    """Delete a TempCodeMapping entry."""
    from app.models.mapping import TempCodeMapping
    m = db.query(TempCodeMapping).filter(TempCodeMapping.id == mapping_id).first()
    if not m:
        raise HTTPException(404, "Not found")
    db.delete(m)
    db.commit()
    return {"deleted": str(mapping_id)}


@router.delete("/{alias_id}")
def delete_alias(alias_id: UUID, db: Session = Depends(get_db)):
    a = db.query(SkuAlias).filter(SkuAlias.id == alias_id).first()
    if not a:
        raise HTTPException(404, "Not found")
    db.delete(a)
    db.commit()
    return {"deleted": str(alias_id)}


@router.post("/import")
async def import_aliases(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    Accept CSV (external_key,product_code[,product_name,note])
    or JSON array [{external_key, product_code, ...}].
    """
    content = await file.read()
    filename = (file.filename or "").lower()

    if filename.endswith(".json"):
        rows = json.loads(content.decode("utf-8"))
    else:
        text = content.decode("utf-8-sig")  # handle BOM
        reader = csv.DictReader(io.StringIO(text))
        rows = list(reader)

    count = bulk_upsert(db, rows, source="import")
    return {"imported": count}


@router.get("/export")
def export_aliases(db: Session = Depends(get_db)):
    """Export all aliases as CSV."""
    from fastapi.responses import StreamingResponse
    items = db.query(SkuAlias).order_by(SkuAlias.external_key).all()
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["external_key", "customer_code", "product_code", "product_name", "contact_code", "source", "note"])
    for a in items:
        writer.writerow([a.external_key, a.customer_code or "", a.product_code, a.product_name or "", a.contact_code or "", a.source, a.note or ""])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=sku_aliases.csv"},
    )
