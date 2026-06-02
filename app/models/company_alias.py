import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Index, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import Base


class CompanyAlias(Base):
    """
    Maps OCR-extracted company name / address → customer_code.
    Auto-learned when accountant confirms a customer selection.

    Upsert key: (external_normalized) → newest mapping wins.
    """
    __tablename__ = "company_aliases"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    external_key = Column(String(500), nullable=False)        # raw OCR text
    external_normalized = Column(String(500), nullable=False, unique=True)
    customer_code = Column(String(64), nullable=False)
    customer_name = Column(String(300), nullable=True)
    alias_type = Column(String(20), default="name", nullable=False)  # name | address
    source = Column(String(20), default="auto_learn", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("ix_company_aliases_normalized", "external_normalized"),
        Index("ix_company_aliases_customer_code", "customer_code"),
    )
