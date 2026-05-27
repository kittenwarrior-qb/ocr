import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Text, Enum as SAEnum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.models.base import Base


class TempCodeMapping(Base):
    __tablename__ = "temp_code_mapping"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    temp_code = Column(String(64), unique=True, nullable=False)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=True)
    status = Column(
        SAEnum("pending", "mapped", name="mapping_status_enum"),
        default="pending",
        nullable=False,
    )
    first_seen_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_used_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    product = relationship("Product", foreign_keys=[product_id])


class MSTMapping(Base):
    __tablename__ = "mst_mapping"

    tax_code = Column(String(20), primary_key=True)
    partner_id = Column(UUID(as_uuid=True), ForeignKey("partners.id"), nullable=False)
    notes = Column(Text, nullable=True)

    partner = relationship("Partner", back_populates="mst_mappings")


class DocumentCorrection(Base):
    __tablename__ = "document_corrections"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    raw_document_id = Column(UUID(as_uuid=True), ForeignKey("raw_documents.id"), nullable=False)
    field_path = Column(String(200), nullable=False)
    original_value = Column(JSONB, nullable=True)
    corrected_value = Column(JSONB, nullable=True)
    corrected_at = Column(DateTime, default=datetime.utcnow, nullable=False)
