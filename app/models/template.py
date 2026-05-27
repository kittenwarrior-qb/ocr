import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, Text, Enum as SAEnum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.models.base import Base


class Template(Base):
    __tablename__ = "templates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code = Column(String(20), unique=True, nullable=False)
    partner_id = Column(UUID(as_uuid=True), ForeignKey("partners.id"), nullable=True)
    document_type = Column(
        SAEnum("purchase_order", "vendor_bill", name="doc_type_enum"),
        nullable=False,
    )
    name = Column(String(200), nullable=False)
    system_prompt = Column(Text, nullable=False)
    output_schema = Column(JSONB, nullable=False)
    field_aliases = Column(JSONB, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    partner = relationship("Partner", back_populates="templates")
