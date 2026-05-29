import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Date, Text, Numeric, Enum as SAEnum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.models.base import Base

DOC_STATUS = ("draft", "processing", "completed", "exported", "rejected")
LINE_MAPPING_STATUS = ("pending", "mapped", "overridden")


class RawDocument(Base):
    __tablename__ = "raw_documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    file_name = Column(String(300), nullable=False)
    file_path = Column(String(500), nullable=False)
    document_type = Column(
        SAEnum("purchase_order", "vendor_bill", name="raw_doc_type_enum"),
        nullable=True,
    )
    ocr_raw_text = Column(Text, nullable=True)
    extracted_data = Column(JSONB, nullable=True)
    extraction_bboxes = Column(JSONB, nullable=True)
    template_id = Column(UUID(as_uuid=True), ForeignKey("templates.id"), nullable=True)
    session_id = Column(UUID(as_uuid=True), ForeignKey("ocr_sessions.id"), nullable=True)
    upload_date = Column(DateTime, default=datetime.utcnow, nullable=False)
    ocr_status = Column(
        SAEnum("pending", "processing", "done", "failed", name="ocr_status_enum"),
        default="pending",
        nullable=False,
    )
    ocr_error = Column(Text, nullable=True)

    corrections = relationship("DocumentCorrection", lazy="select")
    session = relationship("OcrSession", back_populates="raw_documents", foreign_keys=[session_id])


class ProcessedOrder(Base):
    __tablename__ = "processed_orders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    raw_document_id = Column(UUID(as_uuid=True), ForeignKey("raw_documents.id"), nullable=False)
    partner_id = Column(UUID(as_uuid=True), ForeignKey("partners.id"), nullable=True)
    delivery_address_id = Column(UUID(as_uuid=True), ForeignKey("partner_addresses.id"), nullable=True)
    order_number = Column(String(100), nullable=True)
    po_number = Column(String(100), nullable=True)
    order_date = Column(Date, nullable=True)
    delivery_date = Column(Date, nullable=True)
    currency = Column(String(10), nullable=True)
    payment_method = Column(String(200), nullable=True)
    recipient_name = Column(String(200), nullable=True)
    description = Column(Text, nullable=True)
    total_amount = Column(Numeric(18, 2), nullable=True)
    discount_amount = Column(Numeric(18, 2), nullable=True)
    tax_amount = Column(Numeric(18, 2), nullable=True)
    missing_fields = Column(JSONB, nullable=True, default=list)
    extra_data = Column(JSONB, nullable=True, default=dict)
    status = Column(
        SAEnum(*DOC_STATUS, name="order_status_enum"),
        default="draft",
        nullable=False,
    )
    processed_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    lines = relationship("OrderLine", back_populates="order", lazy="select", cascade="all, delete-orphan")
    partner = relationship("Partner", foreign_keys=[partner_id])
    delivery_address = relationship("PartnerAddress", foreign_keys=[delivery_address_id])


class OrderLine(Base):
    __tablename__ = "order_lines"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    processed_order_id = Column(UUID(as_uuid=True), ForeignKey("processed_orders.id"), nullable=False)
    temp_code = Column(String(64), nullable=False)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=True)
    product_name_original = Column(String(500), nullable=False)
    quantity = Column(Numeric(18, 4), nullable=True)
    unit_price = Column(Numeric(18, 2), nullable=True)
    discount_rate = Column(Numeric(5, 2), nullable=True)
    discount_amount = Column(Numeric(18, 2), nullable=True)
    tax_rate = Column(Numeric(5, 2), nullable=True)
    line_total = Column(Numeric(18, 2), nullable=True)
    uom_original = Column(String(50), nullable=True)
    ocr_product_code = Column(String(200), nullable=True)
    mapping_status = Column(
        SAEnum(*LINE_MAPPING_STATUS, name="order_line_status_enum"),
        default="pending",
        nullable=False,
    )

    order = relationship("ProcessedOrder", back_populates="lines")
    product = relationship("Product", foreign_keys=[product_id])


class ProcessedBill(Base):
    __tablename__ = "processed_bills"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    raw_document_id = Column(UUID(as_uuid=True), ForeignKey("raw_documents.id"), nullable=False)
    partner_id = Column(UUID(as_uuid=True), ForeignKey("partners.id"), nullable=True)
    delivery_address_id = Column(UUID(as_uuid=True), ForeignKey("partner_addresses.id"), nullable=True)
    invoice_number = Column(String(100), nullable=True)
    invoice_date = Column(Date, nullable=True)
    delivery_date = Column(Date, nullable=True)
    currency = Column(String(10), nullable=True)
    payment_method = Column(String(200), nullable=True)
    recipient_name = Column(String(200), nullable=True)
    description = Column(Text, nullable=True)
    total_amount = Column(Numeric(18, 2), nullable=True)
    discount_amount = Column(Numeric(18, 2), nullable=True)
    tax_amount = Column(Numeric(18, 2), nullable=True)
    missing_fields = Column(JSONB, nullable=True, default=list)
    status = Column(
        SAEnum(*DOC_STATUS, name="bill_status_enum"),
        default="draft",
        nullable=False,
    )
    processed_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    lines = relationship("BillLine", back_populates="bill", lazy="select", cascade="all, delete-orphan")
    partner = relationship("Partner", foreign_keys=[partner_id])
    delivery_address = relationship("PartnerAddress", foreign_keys=[delivery_address_id])


class BillLine(Base):
    __tablename__ = "bill_lines"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    processed_bill_id = Column(UUID(as_uuid=True), ForeignKey("processed_bills.id"), nullable=False)
    temp_code = Column(String(64), nullable=False)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=True)
    product_name_original = Column(String(500), nullable=False)
    quantity = Column(Numeric(18, 4), nullable=True)
    unit_price = Column(Numeric(18, 2), nullable=True)
    discount_rate = Column(Numeric(5, 2), nullable=True)
    discount_amount = Column(Numeric(18, 2), nullable=True)
    tax_rate = Column(Numeric(5, 2), nullable=True)
    line_total = Column(Numeric(18, 2), nullable=True)
    uom_original = Column(String(50), nullable=True)
    ocr_product_code = Column(String(200), nullable=True)
    mapping_status = Column(
        SAEnum(*LINE_MAPPING_STATUS, name="bill_line_status_enum"),
        default="pending",
        nullable=False,
    )

    bill = relationship("ProcessedBill", back_populates="lines")
    product = relationship("Product", foreign_keys=[product_id])
