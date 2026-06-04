from datetime import datetime
from sqlalchemy import Column, String, DateTime, BigInteger, Enum as SAEnum, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from app.models.base import Base

ATTACHMENT_STATUS = ("pending", "processing", "done")
WEBHOOK_LOG_STATUS = ("received", "processed", "ignored", "failed")


class EmailOrder(Base):
    """Stores incoming emails that contain PDF order attachments."""
    __tablename__ = "email_orders"

    id = Column(Integer, primary_key=True, autoincrement=True)
    external_id = Column(String(500), unique=True, nullable=True)  # message_id from crawl service
    sender_email = Column(String(300), nullable=False)
    sender_name = Column(String(300), nullable=True)
    subject = Column(String(1000), nullable=True)
    received_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    attachments = relationship(
        "EmailAttachment", back_populates="email", cascade="all, delete-orphan", lazy="select"
    )


class EmailAttachment(Base):
    """Each PDF file attached to an EmailOrder, with its own processing status."""
    __tablename__ = "email_attachments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email_id = Column(Integer, ForeignKey("email_orders.id", ondelete="CASCADE"), nullable=False)
    external_attachment_id = Column(Integer, nullable=True)  # attachment id from crawl service
    filename = Column(String(500), nullable=False)
    file_size = Column(BigInteger, nullable=True)
    download_url = Column(String(1000), nullable=True)  # URL to fetch the PDF from crawl service
    status = Column(
        SAEnum(*ATTACHMENT_STATUS, name="email_attachment_status_enum"),
        default="pending",
        nullable=False,
    )
    converted_at = Column(DateTime, nullable=True)   # when user clicked Convert
    done_at = Column(DateTime, nullable=True)         # when user clicked Done to confirm
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    email = relationship("EmailOrder", back_populates="attachments")


class WebhookLog(Base):
    """Audit log of every webhook call received from the Email Gateway."""
    __tablename__ = "webhook_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event = Column(String(100), nullable=True)
    external_id = Column(String(500), nullable=True)  # message_id from payload, for tracing
    payload = Column(JSONB, nullable=True)            # raw payload as received
    status = Column(
        SAEnum(*WEBHOOK_LOG_STATUS, name="webhook_log_status_enum"),
        default="received",
        nullable=False,
    )
    error = Column(Text, nullable=True)               # error message if processing failed
    email_id = Column(Integer, nullable=True)         # resulting EmailOrder id, if processed
    received_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    processed_at = Column(DateTime, nullable=True)
