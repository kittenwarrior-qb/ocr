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
