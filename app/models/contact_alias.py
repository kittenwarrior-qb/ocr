import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import Base


class ContactAlias(Base):
    __tablename__ = "contact_aliases"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    external_key = Column(String(500), nullable=False)           # text từ OCR/PDF
    external_normalized = Column(String(500), nullable=False)    # lowercase, no diacritics
    contact_code = Column(String(50), nullable=False)
    contact_name = Column(String(300), nullable=True)
    alias_type = Column(String(20), nullable=False, default="name")  # name | phone | organization
    source = Column(String(20), nullable=False, default="manual")    # manual | auto_learn
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
