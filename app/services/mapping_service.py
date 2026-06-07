from datetime import datetime
import re
import unicodedata
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.contact import Contact
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


def _normalize_product_name(text: str) -> str:
    value = unicodedata.normalize("NFD", (text or "").lower())
    value = "".join(ch for ch in value if unicodedata.category(ch) != "Mn")
    value = re.sub(r"\bntk\b", "nuoc tinh khiet", value)
    value = re.sub(r"\bth\s*(\d+)\b", r"thung \1", value)
    value = re.sub(r"\b1[\.,]5\s*l\b", "1500ml 1 5l", value)
    value = re.sub(r"\b1\s*500\s*ml\b", "1500ml 1 5l", value)
    value = re.sub(r"\b1\.500\s*ml\b", "1500ml 1 5l", value)
    value = re.sub(r"[^a-z0-9\s]", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def _normalize_text(text: str | None) -> str:
    value = unicodedata.normalize("NFD", (text or "").lower())
    value = "".join(ch for ch in value if unicodedata.category(ch) != "Mn")
    value = re.sub(r"[^a-z0-9\s]", " ", value)
    return re.sub(r"\s+", " ", value).strip()


_GENERIC_PARTNER_WORDS = {
    "cty", "cong", "ty", "tnhh", "tm", "dv", "dich", "vu", "thuong", "mai",
    "co", "phan", "cp", "mtv", "hh", "limited", "company", "viet", "nam",
}


def _distinctive_partner_tokens(text: str | None) -> set[str]:
    value = _normalize_text(text)
    value = re.sub(r"^(cty|cong ty tnhh|cong ty co phan|cong ty|ho kinh doanh|doanh nghiep tu nhan|chi nhanh)\s+", "", value)
    return {word for word in value.split() if len(word) >= 3 and word not in _GENERIC_PARTNER_WORDS}


def _address_numbers(text: str | None) -> set[str]:
    return set(re.findall(r"\d+[a-z]?(?:/\d+[a-z]?)*", _normalize_text(text)))


def _address_match_score(query: str | None, target: str | None) -> int:
    if not query or not target:
        return 0
    score = fuzzy_score(query, target)
    q_nums = _address_numbers(query)
    t_nums = _address_numbers(target)
    if q_nums and t_nums:
        if q_nums & t_nums:
            score += 12
        else:
            score -= 28
    return max(0, min(score, 100))


def _parse_tax_rate(value) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(str(value).replace("%", "").replace(",", ".").strip())
    except (TypeError, ValueError):
        return None


def _tax_match_adjustment(expected_tax_rate, product_tax_rate) -> int:
    expected = _parse_tax_rate(expected_tax_rate)
    actual = _parse_tax_rate(product_tax_rate)
    if expected is None or actual is None:
        return 0
    return 18 if abs(expected - actual) < 0.01 else -25


def _product_match_score(query: str, target: str, expected_tax_rate=None, product_tax_rate=None) -> int:
    from thefuzz import fuzz

    q = _normalize_product_name(query)
    t = _normalize_product_name(target)
    if not q or not t:
        return 0

    score = fuzz.token_set_ratio(q, t)
    if "nuoc tinh khiet" in q and "nuoc tinh khiet" in t:
        score += 25
    if "satori" in q and "satori" in t:
        score += 18
    if "1500ml" in q and "1500ml" in t:
        score += 25
    if "nuoc tinh khiet" in q and "nuoc tinh khiet" not in t:
        score -= 45
    if "1500ml" in q and "1500ml" not in t:
        score -= 45
    if "decal" not in q and "decal" in t:
        score -= 60
    if "vo binh" not in q and "vo binh" in t:
        score -= 35
    score += _tax_match_adjustment(expected_tax_rate, product_tax_rate)
    return max(0, min(score, 100))


# ── Partner ──────────────────────────────────────────────────────────────────

def find_or_create_partner(
    db: Session,
    legal_name: str,
    tax_code: str | None,
    partner_type: str,
) -> Partner:
    # 1. Exact match by tax code (most reliable)
    if tax_code:
        mst = db.query(MSTMapping).filter(MSTMapping.tax_code == tax_code).first()
        if mst:
            p = db.query(Partner).filter(Partner.id == mst.partner_id).first()
            if p:
                return p

    # 2. Fuzzy name match — lower threshold to 70 to handle abbreviations
    all_partners = db.query(Partner).filter(Partner.partner_type == partner_type).all()
    candidates = [{"id": str(p.id), "name": p.legal_name or "", "obj": p} for p in all_partners]
    match = fuzzy_match(legal_name, candidates, key="name", threshold=70)
    if match:
        partner = match["obj"]
        if tax_code and not db.query(MSTMapping).filter(MSTMapping.tax_code == tax_code).first():
            db.add(MSTMapping(tax_code=tax_code, partner_id=partner.id))
            db.flush()
        return partner

    # 3. No match — create new partner
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


def find_existing_partner(
    db: Session,
    legal_name: str | None,
    tax_code: str | None,
    partner_type: str,
) -> tuple[Partner | None, str]:
    """
    Trả về (partner, match_type).
    match_type:
      "tax_code" — khớp chính xác theo MST (đáng tin cậy, không cần xác nhận lại)
      "fuzzy"    — chỉ khớp gần đúng theo tên (máy đoán — UI cần hiển thị rõ để
                   kế toán tự kiểm tra, KHÔNG coi là đã xác nhận)
      ""         — không tìm thấy
    """
    if tax_code:
        mst = db.query(MSTMapping).filter(MSTMapping.tax_code == tax_code).first()
        if mst:
            partner = db.query(Partner).filter(Partner.id == mst.partner_id).first()
            if partner:
                return partner, "tax_code"

        partner = (
            db.query(Partner)
            .filter(
                Partner.partner_type == partner_type,
                Partner.is_active == True,
                Partner.tax_code == tax_code,
            )
            .first()
        )
        if partner:
            return partner, "tax_code"

    if not legal_name:
        return None, ""

    query_tokens = _distinctive_partner_tokens(legal_name)
    if not query_tokens:
        return None, ""

    all_partners = db.query(Partner).filter(Partner.partner_type == partner_type, Partner.is_active == True).all()
    candidates = [{"id": str(p.id), "name": p.legal_name or "", "obj": p} for p in all_partners]
    match = fuzzy_match(legal_name, candidates, key="name", threshold=70)
    if not match:
        return None, ""

    target_tokens = _distinctive_partner_tokens(match["obj"].legal_name)
    if query_tokens & target_tokens:
        return match["obj"], "fuzzy"
    return None, ""


def find_existing_address(
    db: Session,
    partner_id: UUID | None,
    address_text: str | None,
) -> PartnerAddress | None:
    if not partner_id or not address_text:
        return None

    existing = db.query(PartnerAddress).filter(PartnerAddress.partner_id == partner_id).all()
    for addr in existing:
        if addr.mapping_key and addr.mapping_key.lower() in address_text.lower():
            return addr
        if addr.full_address and fuzzy_score(addr.full_address, address_text) >= 80:
            return addr
    return None


def find_best_contact(
    db: Session,
    company_name: str | None,
    address_text: str | None = None,
    recipient_name: str | None = None,
) -> tuple[Contact | None, str]:
    """
    Trả về (contact, match_type). Việc ghép liên hệ luôn dựa trên fuzzy-score
    (tên công ty / địa chỉ / người nhận), nên match_type luôn là "fuzzy" khi
    tìm thấy — UI cần hiển thị rõ đây là máy đoán, chưa phải xác nhận của người dùng.
    """
    contacts = db.query(Contact).all()
    if not contacts:
        return None, ""

    company_norm = _normalize_text(company_name)
    recipient_norm = _normalize_text(recipient_name)
    best_contact: Contact | None = None
    best_score = 0

    for contact in contacts:
        org = contact.organization or ""
        contact_address = contact.delivery_address or contact.address or ""
        org_norm = _normalize_text(org)

        org_score = fuzzy_score(company_name or "", org) if company_name and org else 0
        address_score = _address_match_score(address_text, contact_address)
        recipient_score = fuzzy_score(recipient_name or "", contact.name or "") if recipient_name and contact.name else 0

        if company_norm and org_norm and (company_norm in org_norm or org_norm in company_norm):
            org_score = max(org_score, 95)
        if recipient_norm and _normalize_text(contact.name) and (
            recipient_norm in _normalize_text(contact.name) or _normalize_text(contact.name) in recipient_norm
        ):
            recipient_score = max(recipient_score, 90)

        org_tokens = _distinctive_partner_tokens(company_name)
        contact_org_tokens = _distinctive_partner_tokens(org)
        has_org_overlap = bool(org_tokens & contact_org_tokens)

        score = org_score
        if address_score >= 82 and (has_org_overlap or org_score >= 72):
            score += min(18, address_score // 5)
        if address_score >= 94 and has_org_overlap:
            score = max(score, 88)
        if recipient_score >= 78 and has_org_overlap:
            score = max(score, recipient_score)

        if score > best_score:
            best_score = score
            best_contact = contact

    if best_contact and best_score >= 78:
        return best_contact, "fuzzy"
    return None, ""


def find_customer_for_contact(
    db: Session,
    contact: Contact | None,
    partners: list[Partner] | None = None,
) -> tuple[Partner | None, str]:
    """Trả về (partner, match_type) — luôn "fuzzy" khi tìm thấy (suy ra từ contact.organization)."""
    if not contact or not contact.organization:
        return None, ""

    org = contact.organization
    org_norm = _normalize_text(org)
    if partners is None:
        partners = db.query(Partner).filter(Partner.is_active == True, Partner.partner_type == "customer").all()
    best_partner: Partner | None = None
    best_score = 0

    for partner in partners:
        names = [partner.legal_name or "", partner.display_name or ""]
        for name in names:
            name_norm = _normalize_text(name)
            score = fuzzy_score(org, name) if name else 0
            if org_norm and name_norm and (org_norm in name_norm or name_norm in org_norm):
                score = max(score, 95)
            if score > best_score:
                best_score = score
                best_partner = partner

    if best_partner and best_score >= 72:
        return best_partner, "fuzzy"
    return None, ""


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

def resolve_temp_code(db: Session, product_code: str | None, product_name: str, tax_rate=None) -> tuple[str, UUID | None]:
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

    # Try to auto-match product by name from catalog
    product_id = None
    if product_name and product_name.strip():
        all_products = db.query(Product).filter(Product.is_active == True).all()
        scored = [(_product_match_score(product_name, p.display_name or "", tax_rate, p.tax_rate), p) for p in all_products]
        scored.sort(key=lambda item: item[0], reverse=True)
        if scored and scored[0][0] >= 82:
            product_id = scored[0][1].id

    db.add(TempCodeMapping(
        temp_code=temp_code,
        status="mapped" if product_id else "pending",
        product_id=product_id,
        first_seen_at=now,
        last_used_at=now,
    ))
    db.flush()
    return temp_code, product_id


def count_temp_code_impact(db: Session, temp_code: str) -> dict:
    """
    Đếm số đơn/hóa đơn (chưa xuất) sẽ bị map_temp_code_to_product() cập nhật
    NGƯỢC LẠI nếu áp dụng mapping này — kể cả ghi đè đơn giá đã sửa tay.
    Dùng để hiển thị cảnh báo phạm vi ảnh hưởng cho người dùng TRƯỚC khi áp dụng,
    tránh map nhầm rồi mới phát hiện hàng loạt đơn bị thay đổi không mong muốn.
    """
    order_count = (
        db.query(OrderLine.processed_order_id)
        .join(ProcessedOrder, OrderLine.processed_order_id == ProcessedOrder.id)
        .filter(OrderLine.temp_code == temp_code, ProcessedOrder.status.notin_(["exported"]))
        .distinct()
        .count()
    )
    bill_count = (
        db.query(BillLine.processed_bill_id)
        .join(ProcessedBill, BillLine.processed_bill_id == ProcessedBill.id)
        .filter(BillLine.temp_code == temp_code, ProcessedBill.status.notin_(["exported"]))
        .distinct()
        .count()
    )
    return {"order_count": order_count, "bill_count": bill_count}


def map_temp_code_to_product(db: Session, temp_code: str, product_id: UUID) -> int:
    """
    Permanently maps temp_code → product.
    Retroactively updates all non-exported order_lines and bill_lines.
    Returns total lines updated.
    """
    product = db.query(Product).filter(Product.id == product_id).first()
    mapping = db.query(TempCodeMapping).filter(TempCodeMapping.temp_code == temp_code).first()
    if mapping is None:
        # Create the mapping if it doesn't exist
        mapping = TempCodeMapping(
            temp_code=temp_code,
            status="mapped",
            product_id=product_id,
            first_seen_at=datetime.utcnow(),
            last_used_at=datetime.utcnow(),
        )
        db.add(mapping)
        db.flush()
    else:
        mapping.product_id = product_id
        mapping.status = "mapped"
        mapping.last_used_at = datetime.utcnow()
        db.flush()

    order_lines = (
        db.query(OrderLine)
        .join(ProcessedOrder, OrderLine.processed_order_id == ProcessedOrder.id)
        .filter(
            OrderLine.temp_code == temp_code,
            ProcessedOrder.status.notin_(["exported"]),
        )
        .all()
    )
    for line in order_lines:
        line.product_id = product_id
        if product:
            line.product_name_original = product.display_name or line.product_name_original
            line.ocr_product_code = product.code  # update to mapped code so chi tiết shows correct code
            line.uom_original = product.uom or line.uom_original
            if product.price and product.price > 0:
                line.unit_price = product.price
                if line.quantity is not None:
                    line.line_total = line.quantity * product.price
            if product.tax_rate is not None:
                line.tax_rate = product.tax_rate
        line.mapping_status = "mapped"
    db.flush()

    bill_lines = (
        db.query(BillLine)
        .join(ProcessedBill, BillLine.processed_bill_id == ProcessedBill.id)
        .filter(
            BillLine.temp_code == temp_code,
            ProcessedBill.status.notin_(["exported"]),
        )
        .all()
    )
    for line in bill_lines:
        line.product_id = product_id
        if product:
            line.product_name_original = product.display_name or line.product_name_original
            line.uom_original = product.uom or line.uom_original
            if product.price is not None:
                line.unit_price = product.price
                if line.quantity is not None:
                    line.line_total = line.quantity * product.price
            if product.tax_rate is not None:
                line.tax_rate = product.tax_rate
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
        # KHÔNG tự tính lại total_amount ở đây — đây là dữ liệu gốc từ chứng từ
        # gốc của khách hàng, ghi đè bằng số tự suy ra (sum line_total * thuế)
        # sẽ tạo ra một con số khác với file gốc và gây mất đồng bộ dữ liệu.
        # Giữ nguyên total_amount đã trích xuất; việc tính lại (nếu cần) nên do
        # người dùng chủ động thực hiện sau khi đã rà soát/xác nhận xong mapping.

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
    product = Product(code=code, display_name=display_name, uom=uom, price=0, account_code=account_code)
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
        (p, _product_match_score(temp_code, p.display_name or ""))
        for p in all_products
    ]
    scored.sort(key=lambda x: x[1], reverse=True)
    return [p for p, score in scored[:limit] if score >= 40]
