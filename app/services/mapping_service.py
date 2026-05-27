from datetime import datetime
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.document import BillLine, OrderLine, ProcessedBill, ProcessedOrder
from app.models.mapping import MSTMapping, TempCodeMapping
from app.models.partner import Partner, PartnerAddress
from app.models.product import Product
from app.services.code_generator import (
    generate_address_code,
    generate_partner_code,
    generate_product_code,
)
from app.utils.fuzzy_match import fuzzy_match, fuzzy_score
from app.utils.hash_utils import generate_temp_code


# ── Partner ──────────────────────────────────────────────────────────────────

def find_or_create_partner(
    db: Session,
    legal_name: str,
    tax_code: str | None,
    partner_type: str,
) -> Partner:
    if tax_code:
        mst = db.query(MSTMapping).filter(MSTMapping.tax_code == tax_code).first()
        if mst:
            return db.query(Partner).filter(Partner.id == mst.partner_id).first()

    all_partners = db.query(Partner).filter(Partner.partner_type == partner_type).all()
    candidates = [{"id": str(p.id), "name": p.legal_name or "", "obj": p} for p in all_partners]
    match = fuzzy_match(legal_name, candidates, key="name", threshold=85)
    if match:
        partner = match["obj"]
        if tax_code and not db.query(MSTMapping).filter(MSTMapping.tax_code == tax_code).first():
            db.add(MSTMapping(tax_code=tax_code, partner_id=partner.id))
            db.flush()
        return partner

    code = generate_partner_code(db, partner_type)
    partner = Partner(
        code=code,
        legal_name=legal_name,
        partner_type=partner_type,
        tax_code=tax_code,
    )
    db.add(partner)
    db.flush()

    if tax_code:
        db.add(MSTMapping(tax_code=tax_code, partner_id=partner.id))
        db.flush()

    return partner


# ── Address ───────────────────────────────────────────────────────────────────

def find_or_create_address(
    db: Session,
    partner_id: UUID,
    address_text: str | None,
) -> PartnerAddress | None:
    if not address_text:
        return None

    existing = (
        db.query(PartnerAddress).filter(PartnerAddress.partner_id == partner_id).all()
    )

    for addr in existing:
        if addr.mapping_key and addr.mapping_key.lower() in address_text.lower():
            return addr
        if addr.full_address and fuzzy_score(addr.full_address, address_text) >= 80:
            return addr

    code = generate_address_code(db)
    addr = PartnerAddress(
        code=code,
        partner_id=partner_id,
        full_address=address_text,
        address_type="branch",
    )
    db.add(addr)
    db.flush()
    return addr


# ── Temp-code / product ───────────────────────────────────────────────────────

def resolve_temp_code(db: Session, product_code: str | None, product_name: str) -> tuple[str, UUID | None]:
    """Returns (temp_code, product_id_or_None). Creates TempCodeMapping if new."""
    if product_code and product_code.strip():
        temp_code = product_code.strip()
    else:
        temp_code = generate_temp_code(product_name)

    now = datetime.utcnow()
    mapping = db.query(TempCodeMapping).filter(TempCodeMapping.temp_code == temp_code).first()

    if mapping:
        mapping.last_used_at = now
        db.flush()
        return temp_code, mapping.product_id

    db.add(TempCodeMapping(temp_code=temp_code, status="pending", first_seen_at=now, last_used_at=now))
    db.flush()
    return temp_code, None


def map_temp_code_to_product(db: Session, temp_code: str, product_id: UUID) -> int:
    """
    Permanently maps temp_code → product.
    Retroactively updates all non-exported order_lines and bill_lines.
    Returns total lines updated.
    """
    mapping = db.query(TempCodeMapping).filter(TempCodeMapping.temp_code == temp_code).first()
    if mapping is None:
        raise ValueError(f"temp_code '{temp_code}' not found")

    mapping.product_id = product_id
    mapping.status = "mapped"
    mapping.last_used_at = datetime.utcnow()
    db.flush()

    order_lines = (
        db.query(OrderLine)
        .join(ProcessedOrder, OrderLine.processed_order_id == ProcessedOrder.id)
        .filter(
            OrderLine.temp_code == temp_code,
            OrderLine.product_id == None,
            ProcessedOrder.status.notin_(["exported"]),
        )
        .all()
    )
    for line in order_lines:
        line.product_id = product_id
        line.mapping_status = "mapped"
    db.flush()

    bill_lines = (
        db.query(BillLine)
        .join(ProcessedBill, BillLine.processed_bill_id == ProcessedBill.id)
        .filter(
            BillLine.temp_code == temp_code,
            BillLine.product_id == None,
            ProcessedBill.status.notin_(["exported"]),
        )
        .all()
    )
    for line in bill_lines:
        line.product_id = product_id
        line.mapping_status = "mapped"
    db.flush()

    _recalculate_affected_documents(db, temp_code)
    return len(order_lines) + len(bill_lines)


def _recalculate_affected_documents(db: Session, temp_code: str) -> None:
    orders = (
        db.query(ProcessedOrder)
        .join(OrderLine, ProcessedOrder.id == OrderLine.processed_order_id)
        .filter(
            OrderLine.temp_code == temp_code,
            ProcessedOrder.status.in_(["processing", "draft"]),
        )
        .distinct()
        .all()
    )
    for order in orders:
        _update_document_status(db, order, order.lines)

    bills = (
        db.query(ProcessedBill)
        .join(BillLine, ProcessedBill.id == BillLine.processed_bill_id)
        .filter(
            BillLine.temp_code == temp_code,
            ProcessedBill.status.in_(["processing", "draft"]),
        )
        .distinct()
        .all()
    )
    for bill in bills:
        _update_document_status(db, bill, bill.lines)

    db.flush()


def _update_document_status(db: Session, document, lines: list) -> None:
    if not lines:
        document.status = "draft"
        return
    pending = [l for l in lines if l.mapping_status == "pending"]
    document.status = "processing" if pending else "completed"


def create_product_and_map(
    db: Session,
    temp_code: str,
    display_name: str,
    uom: str,
    account_code: str | None = None,
) -> Product:
    code = generate_product_code(db)
    product = Product(code=code, display_name=display_name, uom=uom, account_code=account_code)
    db.add(product)
    db.flush()
    map_temp_code_to_product(db, temp_code, product.id)
    return product


def suggest_product_matches(db: Session, temp_code: str, limit: int = 5) -> list[Product]:
    mapping = db.query(TempCodeMapping).filter(TempCodeMapping.temp_code == temp_code).first()
    if not mapping:
        return []
    all_products = db.query(Product).filter(Product.is_active == True).all()
    scored = [
        (p, fuzzy_score(temp_code, p.display_name))
        for p in all_products
    ]
    scored.sort(key=lambda x: x[1], reverse=True)
    return [p for p, score in scored[:limit] if score >= 40]
