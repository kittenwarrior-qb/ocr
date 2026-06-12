import re
import unicodedata
from datetime import datetime
from sqlalchemy.orm import Session
from app.models.contact_alias import ContactAlias


def normalize_contact(text: str) -> str:
    """Chuẩn hóa text liên hệ (tên người / tổ chức) để so khớp alias.
    Bỏ dấu, lowercase, gom khoảng trắng, bỏ ký tự đặc biệt."""
    if not text:
        return ""
    nfkd = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in nfkd if not unicodedata.combining(c)).lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def upsert(
    db: Session,
    external_key: str,
    contact_code: str,
    contact_name: str = "",
    alias_type: str = "name",
    source: str = "auto_learn",
) -> ContactAlias | None:
    if not external_key or not external_key.strip() or not contact_code:
        return None
    norm = normalize_contact(external_key)
    if len(norm) < 2:  # quá ngắn, không hữu ích
        return None

    existing = (
        db.query(ContactAlias)
        .filter(ContactAlias.external_normalized == norm, ContactAlias.alias_type == alias_type)
        .first()
    )
    if existing:
        existing.contact_code = contact_code
        existing.contact_name = contact_name or existing.contact_name
        existing.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(existing)
        return existing

    alias = ContactAlias(
        external_key=external_key,
        external_normalized=norm,
        contact_code=contact_code,
        contact_name=contact_name,
        alias_type=alias_type,
        source=source,
    )
    db.add(alias)
    db.commit()
    db.refresh(alias)
    return alias


def lookup(db: Session, text: str) -> ContactAlias | None:
    """Tìm alias liên hệ theo text OCR (khớp chính xác sau chuẩn hóa)."""
    norm = normalize_contact(text)
    if not norm or len(norm) < 2:
        return None
    return (
        db.query(ContactAlias)
        .filter(ContactAlias.external_normalized == norm)
        .order_by(ContactAlias.updated_at.desc())
        .first()
    )
