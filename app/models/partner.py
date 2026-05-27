import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, Text, Enum as SAEnum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.models.base import Base


class Partner(Base):
    __tablename__ = "partners"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code = Column(String(20), unique=True, nullable=False)
    display_name = Column(String(200), nullable=True)
    partner_type = Column(SAEnum("customer", "vendor", name="partner_type_enum"), nullable=False)
    legal_name = Column(String(300), nullable=False)
    tax_code = Column(String(20), nullable=True)
    address = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    addresses = relationship("PartnerAddress", back_populates="partner", lazy="select")
    mst_mappings = relationship("MSTMapping", back_populates="partner", lazy="select")
    templates = relationship("Template", back_populates="partner", lazy="select")


class PartnerAddress(Base):
    __tablename__ = "partner_addresses"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    partner_id = Column(UUID(as_uuid=True), ForeignKey("partners.id"), nullable=False)
    code = Column(String(20), unique=True, nullable=False)
    display_name = Column(String(200), nullable=True)
    address_type = Column(
        SAEnum("main", "branch", "warehouse", "billing", name="address_type_enum"),
        default="branch",
        nullable=False,
    )
    full_address = Column(Text, nullable=True)
    mapping_key = Column(String(200), nullable=True)

    partner = relationship("Partner", back_populates="addresses")
