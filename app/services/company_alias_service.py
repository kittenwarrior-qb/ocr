import re
import unicodedata
from datetime import datetime
from sqlalchemy.orm import Session
from app.models.company_alias import CompanyAlias


def normalize_company(text: str) -> str:
    if not text:
        return ""
    nfkd = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in nfkd if not unicodedata.combining(c))
    text = text.lower()
    # Strip company suffixes
    text = re.sub(r"\b(cong ty|tnhh|co phan|cp|ltd|llc|inc|jsc|hkd|dntn|chi nhanh)\b", "", text)
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def upsert(
    db: Session,
    external_key: str,
    customer_code: str,
    customer_name: str = "",
    alias_type: str = "name",
    source: str = "auto_learn",
) -> CompanyAlias | None:
    if not external_key or not external_key.strip() or not customer_code:
        return None
    norm = normalize_company(external_key)
    if len(norm) < 3:  # too short to be useful
        return None

    existing = db.query(CompanyAlias).filter(CompanyAlias.external_normalized == norm).first()
    if existing:
        existing.customer_code = customer_code
        existing.customer_name = customer_name or existing.customer_name
        existing.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(existing)
        return existing

    alias = CompanyAlias(
        external_key=external_key,
        external_normalized=norm,
        customer_code=customer_code,
        customer_name=customer_name,
        alias_type=alias_type,
        source=source,
    )
    db.add(alias)
    db.commit()
    db.refresh(alias)
    return alias


def lookup(db: Session, text: str) -> CompanyAlias | None:
    norm = normalize_company(text)
    if not norm or len(norm) < 3:
        return None
    return (
        db.query(CompanyAlias)
        .filter(CompanyAlias.external_normalized == norm)
        .order_by(CompanyAlias.updated_at.desc())
        .first()
    )
