from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.company_alias import CompanyAlias
from app.services.company_alias_service import upsert, normalize_company

router = APIRouter(prefix="/company-aliases", tags=["CompanyAliases"])


@router.get("/preload")
def preload(db: Session = Depends(get_db)):
    """All aliases for frontend cache."""
    items = db.query(CompanyAlias).order_by(CompanyAlias.updated_at.desc()).limit(5000).all()
    return [
        {
            "external_normalized": a.external_normalized,
            "customer_code": a.customer_code,
            "customer_name": a.customer_name or "",
            "alias_type": a.alias_type,
        }
        for a in items
    ]


@router.get("")
def list_aliases(search: str = "", skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    q = db.query(CompanyAlias)
    if search:
        norm = normalize_company(search)
        q = q.filter(
            CompanyAlias.external_normalized.ilike(f"%{norm}%")
            | CompanyAlias.customer_code.ilike(f"%{search}%")
            | CompanyAlias.customer_name.ilike(f"%{search}%")
        )
    total = q.count()
    items = q.order_by(CompanyAlias.updated_at.desc()).offset(skip).limit(limit).all()
    return {
        "items": [
            {
                "id": str(a.id),
                "external_key": a.external_key,
                "external_normalized": a.external_normalized,
                "customer_code": a.customer_code,
                "customer_name": a.customer_name or "",
                "alias_type": a.alias_type,
                "source": a.source,
                "updated_at": a.updated_at.isoformat(),
            }
            for a in items
        ],
        "total": total,
    }


@router.post("")
def create_alias(body: dict, db: Session = Depends(get_db)):
    a = upsert(
        db,
        external_key=(body.get("external_key") or "").strip(),
        customer_code=(body.get("customer_code") or "").strip(),
        customer_name=(body.get("customer_name") or "").strip(),
        alias_type=body.get("alias_type", "name"),
        source=body.get("source", "manual"),
    )
    if not a:
        from fastapi import HTTPException
        raise HTTPException(400, "external_key too short or customer_code missing")
    return {"id": str(a.id), "external_normalized": a.external_normalized}


@router.delete("/{alias_id}")
def delete_alias(alias_id: str, db: Session = Depends(get_db)):
    from uuid import UUID
    a = db.query(CompanyAlias).filter(CompanyAlias.id == UUID(alias_id)).first()
    if a:
        db.delete(a)
        db.commit()
    return {"deleted": alias_id}
