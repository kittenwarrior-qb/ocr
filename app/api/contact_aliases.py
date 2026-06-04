import unicodedata
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.database import get_db
from app.models.contact_alias import ContactAlias

router = APIRouter(prefix="/contact-aliases", tags=["Contact Aliases"])


def _norm(text: str) -> str:
    return unicodedata.normalize("NFD", text).encode("ascii", "ignore").decode().lower()


@router.get("")
def list_contact_aliases(
    search: str = "",
    alias_type: str = "",
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    q = db.query(ContactAlias)
    if alias_type:
        q = q.filter(ContactAlias.alias_type == alias_type)
    if search:
        terms = list({search.strip(), _norm(search)} - {""})
        conds = []
        for t in terms:
            conds += [
                ContactAlias.external_key.ilike(f"%{t}%"),
                ContactAlias.contact_code.ilike(f"%{t}%"),
                ContactAlias.contact_name.ilike(f"%{t}%"),
            ]
        q = q.filter(or_(*conds))
    total = q.count()
    items = q.order_by(ContactAlias.updated_at.desc()).offset(skip).limit(limit).all()
    return {
        "items": [
            {
                "id": str(r.id),
                "external_key": r.external_key,
                "external_normalized": r.external_normalized,
                "contact_code": r.contact_code,
                "contact_name": r.contact_name or "",
                "alias_type": r.alias_type,
                "source": r.source,
                "updated_at": r.updated_at.isoformat() if r.updated_at else "",
            }
            for r in items
        ],
        "total": total,
    }


@router.post("")
def upsert_contact_alias(body: dict, db: Session = Depends(get_db)):
    external_key = (body.get("external_key") or "").strip()
    contact_code = (body.get("contact_code") or "").strip()
    if not external_key or not contact_code:
        raise HTTPException(status_code=400, detail="external_key và contact_code là bắt buộc")

    existing = db.query(ContactAlias).filter(
        ContactAlias.external_normalized == _norm(external_key),
        ContactAlias.alias_type == (body.get("alias_type") or "name"),
    ).first()

    if existing:
        existing.external_key = external_key
        existing.contact_code = contact_code
        existing.contact_name = body.get("contact_name") or existing.contact_name
        existing.source = body.get("source") or existing.source
    else:
        db.add(ContactAlias(
            external_key=external_key,
            external_normalized=_norm(external_key),
            contact_code=contact_code,
            contact_name=body.get("contact_name") or "",
            alias_type=body.get("alias_type") or "name",
            source=body.get("source") or "manual",
        ))
    db.commit()
    return {"ok": True}


@router.delete("/{alias_id}")
def delete_contact_alias(alias_id: str, db: Session = Depends(get_db)):
    rec = db.query(ContactAlias).filter(ContactAlias.id == alias_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Không tìm thấy")
    db.delete(rec)
    db.commit()
    return {"deleted": alias_id}
