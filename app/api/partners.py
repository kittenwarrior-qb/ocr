from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.partner import Partner, PartnerAddress
from app.schemas.partner import PartnerAddressUpdate, PartnerOut, PartnerUpdate

router = APIRouter(prefix="/partners", tags=["Partners"])


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


@router.get("/customers/all")
def list_all_customers(db: Session = Depends(get_db)):
    """Return all customers with addresses (for frontend catalog matching)."""
    customers = (
        db.query(Partner)
        .filter(Partner.is_active == True, Partner.partner_type == "customer")
        .order_by(Partner.code)
        .all()
    )
    result = []
    for c in customers:
        billing = next((a for a in c.addresses if a.address_type == "billing"), None)
        delivery = next((a for a in c.addresses if a.address_type == "branch"), None)
        result.append({
            "code": c.code,
            "type": "",
            "name": c.legal_name,
            "tax_code": c.tax_code or "",
            "phone": "",
            "owner": "",
            "invoice_address": billing.full_address if billing else (c.address or ""),
            "invoice_city": billing.mapping_key if billing else "",
            "invoice_district": "",
            "invoice_ward": "",
            "delivery_address": delivery.full_address if delivery else "",
        })
    return result


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
