"""
SKU Alias service — normalize + upsert + lookup.
"""
import re
import unicodedata
from datetime import datetime
from sqlalchemy.orm import Session
from app.models.sku_alias import SkuAlias


def normalize_key(text: str) -> str:
    """Lowercase, remove accents, collapse spaces, strip special chars."""
    if not text:
        return ""
    # Remove accents
    nfkd = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in nfkd if not unicodedata.combining(c))
    text = text.lower()
    # Expand common abbreviations
    text = re.sub(r"\bntk\b", "nuoc tinh khiet", text)
    text = re.sub(r"\bth\s*(\d+)", r"thung \1", text)
    text = re.sub(r"1[.,]5\s*l\b", "1500ml", text)
    text = re.sub(r"1\s*500\s*ml", "1500ml", text)
    # Strip non-alphanumeric
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def upsert_alias(
    db: Session,
    external_key: str,
    product_code: str,
    product_name: str = "",
    source: str = "manual",
    note: str = "",
) -> SkuAlias:
    """
    Insert or update alias. Same external_key → update product_code + updated_at.
    This implements the "take newest" rule.
    """
    norm = normalize_key(external_key)
    existing = (
        db.query(SkuAlias)
        .filter(SkuAlias.external_normalized == norm)
        .first()
    )
    if existing:
        existing.product_code = product_code
        existing.product_name = product_name or existing.product_name
        existing.source = source
        existing.updated_at = datetime.utcnow()
        if note:
            existing.note = note
        db.commit()
        db.refresh(existing)
        return existing
    else:
        alias = SkuAlias(
            external_key=external_key,
            external_normalized=norm,
            product_code=product_code,
            product_name=product_name,
            source=source,
            note=note,
        )
        db.add(alias)
        db.commit()
        db.refresh(alias)
        return alias


def lookup(db: Session, external_key: str) -> SkuAlias | None:
    """Exact normalized match → most recently updated."""
    norm = normalize_key(external_key)
    return (
        db.query(SkuAlias)
        .filter(SkuAlias.external_normalized == norm)
        .order_by(SkuAlias.updated_at.desc())
        .first()
    )


def bulk_upsert(db: Session, rows: list[dict], source: str = "import") -> int:
    """Upsert many aliases at once. Returns count of processed rows."""
    count = 0
    for row in rows:
        key = (row.get("external_key") or "").strip()
        code = (row.get("product_code") or "").strip()
        if not key or not code:
            continue
        upsert_alias(
            db,
            external_key=key,
            product_code=code,
            product_name=(row.get("product_name") or "").strip(),
            source=source,
            note=(row.get("note") or "").strip(),
        )
        count += 1
    return count
