import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, Numeric
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import Base


class Product(Base):
    __tablename__ = "products"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code = Column(String(20), unique=True, nullable=False)
    display_name = Column(String(300), nullable=False)
    uom = Column(String(50), nullable=False)
    price = Column(Numeric(18, 2), nullable=False, default=0)
    tax_rate = Column(Numeric(5, 2), nullable=True)
    property = Column(String(100), nullable=True)
    product_type = Column(String(100), nullable=True)
    conversion_factor = Column(Numeric(10, 4), default=1, nullable=False)
    account_code = Column(String(20), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
