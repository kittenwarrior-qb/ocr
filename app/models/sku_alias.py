import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Text, Index
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import Base


class SkuAlias(Base):
    """
    Maps an external OCR key (SKU code, product name from PDF)
    to an internal product code.
    Rule: same external_key → keep most recently updated entry.
    """
    __tablename__ = "sku_aliases"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    external_key = Column(String(500), nullable=False)         # raw OCR text / barcode
    external_normalized = Column(String(500), nullable=False)  # lowercased+stripped for fast lookup
    product_code = Column(String(64), nullable=False)          # internal code (e.g. TP-00003NC)
    product_name = Column(String(300), nullable=True)          # internal display name
    source = Column(String(20), default="manual", nullable=False)  # manual | auto_learn | import
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("ix_sku_aliases_normalized", "external_normalized"),
        Index("ix_sku_aliases_product_code", "product_code"),
    )
