import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import Base


class POHistory(Base):
    __tablename__ = "po_history"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    po_number = Column(String(100), nullable=False, index=True)
    order_id = Column(UUID(as_uuid=True), ForeignKey("processed_orders.id", ondelete="SET NULL"), nullable=True)
    customer_code = Column(String(50), nullable=True)
    customer_name = Column(String(300), nullable=True)
    sale_order_no = Column(String(50), nullable=True)   # số DH trên MISA sau khi push
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
