"""
SKU Alias service.

Lookup priority:
  1. (normalized_key, customer_code)  — specific to this customer
  2. (normalized_key, NULL)           — generic alias
  3. caller falls back to fuzzy match

Upsert key = (external_normalized, customer_code).
Same combo always updates — newest mapping wins.
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
    nfkd = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in nfkd if not unicodedata.combining(c))
    text = text.lower()
    text = re.sub(r"\bntk\b", "nuoc tinh khiet", text)
    text = re.sub(r"\bth\s*(\d+)", r"thung \1", text)
    text = re.sub(r"1[.,]5\s*l\b", "1500ml", text)
    text = re.sub(r"1\s*500\s*ml", "1500ml", text)
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def upsert_alias(
    db: Session,
    external_key: str,
    product_code: str,
    customer_code: str | None = None,
    product_name: str = "",
    contact_code: str | None = None,
    source: str = "manual",
    note: str = "",
) -> SkuAlias:
    """
    Upsert by (external_normalized, customer_code).
    Newest mapping always wins.
    """
    norm = normalize_key(external_key)
    # customer_code=None and customer_code="" both mean "generic"
    cust = customer_code.strip() if customer_code and customer_code.strip() else None

    existing = (
        db.query(SkuAlias)
        .filter(
            SkuAlias.external_normalized == norm,
            SkuAlias.customer_code == cust,
        )
        .first()
    )
    if existing:
        existing.product_code = product_code
        existing.product_name = product_name or existing.product_name
        existing.contact_code = contact_code or existing.contact_code
        existing.source = source
        existing.updated_at = datetime.utcnow()
        if note:
            existing.note = note
        db.commit()
        db.refresh(existing)
        return existing

    alias = SkuAlias(
        external_key=external_key,
        external_normalized=norm,
        customer_code=cust,
        product_code=product_code,
        product_name=product_name,
        contact_code=contact_code,
        source=source,
        note=note,
    )
    db.add(alias)
    db.commit()
    db.refresh(alias)
    return alias


def lookup(db: Session, external_key: str, customer_code: str | None = None) -> SkuAlias | None:
    """
    Priority:
      1. (norm, customer_code) if customer_code provided
      2. (norm, NULL)  — generic
    Returns newest match at each priority level.
    """
    norm = normalize_key(external_key)
    cust = customer_code.strip() if customer_code and customer_code.strip() else None

    if cust:
        hit = (
            db.query(SkuAlias)
            .filter(SkuAlias.external_normalized == norm, SkuAlias.customer_code == cust)
            .order_by(SkuAlias.updated_at.desc())
            .first()
        )
        if hit:
            return hit

    # Generic fallback
    return (
        db.query(SkuAlias)
        .filter(SkuAlias.external_normalized == norm, SkuAlias.customer_code.is_(None))
        .order_by(SkuAlias.updated_at.desc())
        .first()
    )


def bulk_upsert(db: Session, rows: list[dict], source: str = "import") -> int:
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
            customer_code=(row.get("customer_code") or None),
            product_name=(row.get("product_name") or "").strip(),
            contact_code=(row.get("contact_code") or None),
            source=source,
            note=(row.get("note") or "").strip(),
        )
        count += 1
    return count
