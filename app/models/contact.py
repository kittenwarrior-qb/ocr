import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import Base


class Contact(Base):
    __tablename__ = "contacts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code = Column(String(20), unique=True, nullable=False)
    title = Column(String(50), nullable=True)
    name = Column(String(200), nullable=False)
    job_title = Column(String(200), nullable=True)
    phone = Column(String(50), nullable=True)
    phone_work = Column(String(50), nullable=True)
    email = Column(String(300), nullable=True)
    email_personal = Column(String(300), nullable=True)
    organization = Column(String(300), nullable=True)
    delivery_address = Column(Text, nullable=True)
    address = Column(Text, nullable=True)
    city = Column(String(100), nullable=True)
    district = Column(String(100), nullable=True)
    ward = Column(String(100), nullable=True)
    owner = Column(String(200), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
