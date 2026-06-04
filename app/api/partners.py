import unicodedata
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.partner import Partner, PartnerAddress
from app.models.contact import Contact
from app.schemas.partner import PartnerAddressUpdate, PartnerOut, PartnerUpdate
from app.services import mapping_service

router = APIRouter(prefix="/partners", tags=["Partners"])


def _norm(text: str) -> str:
    """Normalize Vietnamese: remove diacritics, lowercase."""
    return unicodedata.normalize("NFD", text).encode("ascii", "ignore").decode().lower()


@router.get("", response_model=list[PartnerOut])
def list_partners(
    partner_type: str | None = None,
    search: str | None = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    q = db.query(Partner).filter(Partner.is_active == True)
    if partner_type:
        q = q.filter(Partner.partner_type == partner_type)
    if search:
        q = q.filter(
            Partner.legal_name.ilike(f"%{search}%")
            | Partner.display_name.ilike(f"%{search}%")
            | Partner.tax_code.ilike(f"%{search}%")
        )
    return q.order_by(Partner.legal_name).offset(skip).limit(limit).all()


@router.get("/catalog")
def list_all_customers(
    search: str = "",
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    """Return customers with addresses, paginated for frontend."""
    q = db.query(Partner).filter(
        Partner.is_active == True, Partner.partner_type == "customer"
    )
    if search:
        terms = [t for t in [search.strip(), _norm(search)] if t]
        conditions = []
        for t in terms:
            conditions += [
                Partner.legal_name.ilike(f"%{t}%"),
                Partner.code.ilike(f"%{t}%"),
                Partner.tax_code.ilike(f"%{t}%"),
                Partner.owner.ilike(f"%{t}%"),
                Partner.address.ilike(f"%{t}%"),
            ]
        from sqlalchemy import or_, exists as sa_exists
        addr_subq = sa_exists().where(
            (PartnerAddress.partner_id == Partner.id) &
            or_(*[PartnerAddress.full_address.ilike(f"%{t}%") for t in terms])
        )
        q = q.filter(or_(*conditions, addr_subq))
    total = q.count()
    customers = q.order_by(Partner.code).offset(skip).limit(limit).all()

    # Batch-load addresses chỉ cho N partner hiện tại (không joinedload toàn bộ)
    if customers:
        ids = [c.id for c in customers]
        addrs = db.query(PartnerAddress).filter(PartnerAddress.partner_id.in_(ids)).all()
        addr_map: dict = {}
        for a in addrs:
            addr_map.setdefault(a.partner_id, []).append(a)
    else:
        addr_map = {}

    result = []
    for c in customers:
        addrs = addr_map.get(c.id, [])
        billing = next((a for a in addrs if a.address_type == "billing"), None)
        delivery = next((a for a in addrs if a.address_type == "branch"), None)
        result.append({
            "code": c.code,
            "type": (c.display_name or "") if c.display_name != c.legal_name else "",
            "name": c.legal_name,
            "tax_code": c.tax_code or "",
            "phone": c.phone or "",
            "email": c.email or "",
            "field": c.field or "",
            "owner": c.owner or "",
            "description": c.description or "",
            "invoice_address": billing.full_address if billing else (c.address or ""),
            "invoice_city": billing.mapping_key if billing else "",
            "invoice_district": "",
            "invoice_ward": "",
            "delivery_address": delivery.full_address if delivery else "",
        })
    return {"items": result, "total": total}


@router.post("/export-customers-json")
def export_customers_json(db: Session = Depends(get_db)):
    """Dump toàn bộ customers từ DB → data/customers.json (dùng sau khi sync MISA)."""
    import json
    from pathlib import Path

    customers = db.query(Partner).filter(
        Partner.is_active == True, Partner.partner_type == "customer"
    ).order_by(Partner.code).all()

    ids = [c.id for c in customers]
    addrs = db.query(PartnerAddress).filter(PartnerAddress.partner_id.in_(ids)).all() if ids else []
    addr_map: dict = {}
    for a in addrs:
        addr_map.setdefault(a.partner_id, []).append(a)

    result = []
    for c in customers:
        al = addr_map.get(c.id, [])
        billing  = next((a for a in al if a.address_type == "billing"), None)
        delivery = next((a for a in al if a.address_type == "branch"), None)
        result.append({
            "code":             c.code,
            "type":             (c.display_name or "") if c.display_name != c.legal_name else "",
            "name":             c.legal_name,
            "tax_code":         c.tax_code or "",
            "phone":            c.phone or "",
            "email":            c.email or "",
            "field":            c.field or "",
            "owner":            c.owner or "",
            "description":      c.description or "",
            "invoice_address":  billing.full_address  if billing  else (c.address or ""),
            "invoice_city":     billing.mapping_key   if billing  else "",
            "invoice_district": "",
            "invoice_ward":     "",
            "delivery_address": delivery.full_address if delivery else "",
        })

    path = Path(__file__).parent.parent.parent / "data" / "customers.json"
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"exported": len(result), "path": str(path)}


@router.get("/contacts")
def list_contacts(
    search: str = "",
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    """Return contacts, paginated and searchable."""
    q = db.query(Contact)
    if search:
        from sqlalchemy import or_
        terms = [t for t in [search.strip(), _norm(search)] if t]
        conditions = []
        for t in terms:
            conditions += [
                Contact.name.ilike(f"%{t}%"),
                Contact.organization.ilike(f"%{t}%"),
                Contact.phone.ilike(f"%{t}%"),
                Contact.email.ilike(f"%{t}%"),
                Contact.code.ilike(f"%{t}%"),
                Contact.address.ilike(f"%{t}%"),
                Contact.delivery_address.ilike(f"%{t}%"),
            ]
        q = q.filter(or_(*conditions))
    total = q.count()
    contacts = q.order_by(Contact.name).offset(skip).limit(limit).all()

    # Match customer by organization name — only query the relevant subset, not all 2000+
    org_names = {c.organization.lower() for c in contacts if c.organization}
    customer_map: dict = {}
    if org_names:
        matched_customers = db.query(Partner).filter(
            Partner.is_active == True,
            Partner.partner_type == "customer",
        ).all()
        for p in matched_customers:
            name = (p.legal_name or "").lower()
            if any(o in name or name in o for o in org_names):
                customer_map[name] = p

    items = []
    for c in contacts:
        org = (c.organization or "").lower()
        customer = customer_map.get(org) or next(
            (v for k, v in customer_map.items() if org and (k in org or org in k)), None
        ) if org else None
        items.append(
            {
                "code": c.code,
                "title": c.title or "",
                "name": c.name,
                "job_title": c.job_title or "",
                "phone": c.phone or "",
                "phone_work": c.phone_work or "",
                "email": c.email or "",
                "email_personal": c.email_personal or "",
                "organization": c.organization or "",
                "delivery_address": c.delivery_address or "",
                "address": c.address or "",
                "city": c.city or "",
                "district": c.district or "",
                "ward": c.ward or "",
                "owner": c.owner or "",
                "customer_code": customer.code if customer else "",
                "customer_name": customer.legal_name if customer else "",
                "customer_tax_code": customer.tax_code if customer else "",
            }
        )
    return {
        "items": items,
        "total": total,
    }


@router.get("/{partner_id}", response_model=PartnerOut)
def get_partner(partner_id: UUID, db: Session = Depends(get_db)):
    p = db.query(Partner).filter(Partner.id == partner_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Partner not found")
    return p


@router.patch("/{partner_id}", response_model=PartnerOut)
def update_partner(partner_id: UUID, body: PartnerUpdate, db: Session = Depends(get_db)):
    p = db.query(Partner).filter(Partner.id == partner_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Partner not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(p, field, value)
    db.commit()
    db.refresh(p)
    return p


@router.get("/{partner_id}/addresses")
def list_addresses(partner_id: UUID, db: Session = Depends(get_db)):
    return db.query(PartnerAddress).filter(PartnerAddress.partner_id == partner_id).all()


@router.patch("/addresses/{address_id}")
def update_address(address_id: UUID, body: PartnerAddressUpdate, db: Session = Depends(get_db)):
    addr = db.query(PartnerAddress).filter(PartnerAddress.id == address_id).first()
    if not addr:
        raise HTTPException(status_code=404, detail="Address not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(addr, field, value)
    db.commit()
    db.refresh(addr)
    return addr
