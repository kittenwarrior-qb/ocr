"""
Sync MISA CRM data → local PostgreSQL.
Upserts by code so it is safe to run repeatedly.
"""
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy.orm import Session

from app.models.contact import Contact
from app.models.mapping import MSTMapping
from app.models.partner import Partner, PartnerAddress
from app.models.product import Product
from app.services.misa_client import misa_client


# ── helpers ──────────────────────────────────────────────────────────────────

def _s(val: Any) -> str:
    return (str(val) if val is not None else "").strip()


def _opt(val: Any) -> str | None:
    v = _s(val)
    return v or None


def _parse_price(val: Any) -> Decimal:
    try:
        return Decimal(_s(val).replace(",", "") or "0")
    except InvalidOperation:
        return Decimal("0")


def _parse_tax(val: Any) -> Decimal | None:
    try:
        cleaned = _s(val).replace("%", "").replace(",", ".")
        return Decimal(cleaned) if cleaned else None
    except InvalidOperation:
        return None


def _extract_items(resp: dict) -> list[dict]:
    """Handle MISA response where .data is a list or a paginated dict."""
    data = resp.get("data")
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return data.get("data") or data.get("items") or []
    return []


def _fetch_all(fetch_fn) -> list[dict]:
    all_items: list[dict] = []
    page = 0
    while True:
        resp = fetch_fn(page=page, page_size=100)
        items = _extract_items(resp)
        if not items:
            break
        all_items.extend(items)
        if len(items) < 100:
            break
        page += 1
    return all_items


# ── customers ─────────────────────────────────────────────────────────────────

def sync_customers(db: Session) -> dict:
    items = _fetch_all(misa_client.list_customers)
    created = updated = errors = 0

    for item in items:
        code = _s(item.get("account_number"))
        name = _s(item.get("account_name"))
        if not code or not name:
            continue
        try:
            with db.begin_nested():
                partner = db.query(Partner).filter(Partner.code == code).first()
                fields = dict(
                    legal_name=name,
                    display_name=_opt(item.get("account_type")) or name,
                    partner_type="customer",
                    tax_code=_opt(item.get("tax_code")),
                    phone=_opt(item.get("office_tel")),
                    email=_opt(item.get("office_email")),
                    field=_opt(item.get("industry")),
                    owner=_opt(item.get("owner_name")),
                    description=_opt(item.get("description")),
                    address=_opt(item.get("billing_address")),
                )
                if partner:
                    for k, v in fields.items():
                        setattr(partner, k, v)
                    updated += 1
                else:
                    partner = Partner(code=code, **fields)
                    db.add(partner)
                    db.flush()
                    tax = fields["tax_code"]
                    if tax and not db.query(MSTMapping).filter(MSTMapping.tax_code == tax).first():
                        db.add(MSTMapping(tax_code=tax, partner_id=partner.id))
                    created += 1

                # Upsert billing address
                billing = _opt(item.get("billing_address"))
                if billing:
                    bill_code = f"{code[:15]}-B"
                    addr = db.query(PartnerAddress).filter(PartnerAddress.code == bill_code).first()
                    if addr:
                        addr.full_address = billing
                        addr.mapping_key = _opt(item.get("billing_province"))
                    else:
                        db.add(PartnerAddress(
                            code=bill_code, partner_id=partner.id,
                            display_name=f"HĐ - {name[:40]}",
                            address_type="billing", full_address=billing,
                            mapping_key=_opt(item.get("billing_province")),
                        ))

                # Upsert shipping address
                shipping = _opt(item.get("shipping_address"))
                if shipping and shipping != billing:
                    ship_code = f"{code[:15]}-S"
                    addr = db.query(PartnerAddress).filter(PartnerAddress.code == ship_code).first()
                    if addr:
                        addr.full_address = shipping
                    else:
                        db.add(PartnerAddress(
                            code=ship_code, partner_id=partner.id,
                            display_name=f"GH - {name[:40]}",
                            address_type="branch", full_address=shipping,
                        ))
        except Exception:
            errors += 1

    db.commit()
    return {"total": len(items), "created": created, "updated": updated, "errors": errors}


# ── products ──────────────────────────────────────────────────────────────────

def sync_products(db: Session) -> dict:
    items = _fetch_all(misa_client.list_products)
    created = updated = errors = 0

    for item in items:
        code = _s(item.get("product_code"))
        name = _s(item.get("product_name"))
        if not code or not name:
            continue
        try:
            with db.begin_nested():
                fields = dict(
                    display_name=name,
                    uom=_opt(item.get("usage_unit")) or "Cái",
                    price=_parse_price(item.get("unit_price")),
                    tax_rate=_parse_tax(item.get("tax")),
                    property=_opt(item.get("product_properties")),
                    product_type=_opt(item.get("product_category")),
                    is_active=not bool(item.get("inactive")),
                )
                product = db.query(Product).filter(Product.code == code).first()
                if product:
                    for k, v in fields.items():
                        setattr(product, k, v)
                    updated += 1
                else:
                    db.add(Product(code=code, **fields))
                    created += 1
        except Exception:
            errors += 1

    db.commit()
    return {"total": len(items), "created": created, "updated": updated, "errors": errors}


# ── contacts ──────────────────────────────────────────────────────────────────

def sync_contacts(db: Session) -> dict:
    items = _fetch_all(misa_client.list_contacts)
    created = updated = errors = 0

    for item in items:
        code = _s(item.get("contact_code"))
        name = _s(item.get("contact_name"))
        if not code or not name:
            continue
        try:
            with db.begin_nested():
                fields = dict(
                    title=_opt(item.get("salutation")),
                    name=name,
                    job_title=_opt(item.get("title")),
                    phone=_opt(item.get("mobile")),
                    phone_work=_opt(item.get("office_tel")),
                    email=_opt(item.get("office_email")),
                    email_personal=_opt(item.get("email")),
                    organization=_opt(item.get("account_name")),
                    delivery_address=_opt(item.get("shipping_address")),
                    address=_opt(item.get("mailing_address")),
                    city=_opt(item.get("mailing_province")),
                    district=_opt(item.get("mailing_district")),
                    ward=_opt(item.get("mailing_ward")),
                    owner=_opt(item.get("owner_name")),
                )
                contact = db.query(Contact).filter(Contact.code == code).first()
                if contact:
                    for k, v in fields.items():
                        setattr(contact, k, v)
                    updated += 1
                else:
                    db.add(Contact(code=code, **fields))
                    created += 1
        except Exception:
            errors += 1

    db.commit()
    return {"total": len(items), "created": created, "updated": updated, "errors": errors}
