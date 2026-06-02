import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Text, Index, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import Base


class SkuAlias(Base):
    """
    Maps (external_sku, customer_code) → product_code.

    Lookup priority:
      1. exact (normalized_key, customer_code)  — most specific
      2. exact (normalized_key, NULL)           — generic fallback
      3. fuzzy match against product catalog    — last resort

    Upsert key = (external_normalized, customer_code).
    Same combo → update product_code + updated_at (newest wins).

    Table size is bounded: unique (sku, customer) combos ≤
      distinct_ocr_names × num_customers — grows only on new combos.
    """
    __tablename__ = "sku_aliases"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    external_key = Column(String(500), nullable=False)          # raw OCR text / barcode
    external_normalized = Column(String(500), nullable=False)   # normalized for lookup
    customer_code = Column(String(64), nullable=True)           # NULL = applies to all customers
    product_code = Column(String(64), nullable=False)           # internal product code
    product_name = Column(String(300), nullable=True)           # internal display name
    contact_code = Column(String(64), nullable=True)            # optional contact reference
    source = Column(String(20), default="manual", nullable=False)  # manual | auto_learn | import
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        # Upsert key: same (normalized, customer) → update, not insert
        UniqueConstraint("external_normalized", "customer_code", name="uq_alias_norm_customer"),
        Index("ix_sku_aliases_normalized", "external_normalized"),
        Index("ix_sku_aliases_customer", "customer_code"),
        Index("ix_sku_aliases_product_code", "product_code"),
    )
