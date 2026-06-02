from pydantic import BaseModel
from typing import Optional, Any
from uuid import UUID
from datetime import datetime, date
from decimal import Decimal


class UploadResponse(BaseModel):
    raw_document_id: UUID
    file_name: str
    ocr_status: str
    message: str


class LineOut(BaseModel):
    id: UUID
    temp_code: str
    product_id: Optional[UUID]
    product_name_original: str
    quantity: Optional[Decimal]
    unit_price: Optional[Decimal]
    discount_rate: Optional[Decimal]
    discount_amount: Optional[Decimal]
    tax_rate: Optional[Decimal]
    line_total: Optional[Decimal]
    uom_original: Optional[str]
    mapping_status: str

    model_config = {"from_attributes": True}


class BillLineOut(LineOut):
    pass


class ProcessedOrderOut(BaseModel):
    id: UUID
    raw_document_id: UUID
    partner_id: Optional[UUID]
    delivery_address_id: Optional[UUID]
    order_number: Optional[str]
    po_number: Optional[str]
    order_date: Optional[date]
    delivery_date: Optional[date]
    currency: Optional[str]
    payment_method: Optional[str]
    recipient_name: Optional[str]
    description: Optional[str]
    total_amount: Optional[Decimal]
    discount_amount: Optional[Decimal]
    tax_amount: Optional[Decimal]
    extra_data: Optional[dict[str, Any]] = None
    status: str
    processed_at: datetime
    file_name: Optional[str] = None
    lines: list[LineOut] = []
    pending_count: int = 0
    mapped_count: int = 0
    missing_fields: list[str] = []

    model_config = {"from_attributes": True}


class ProcessedBillOut(BaseModel):
    id: UUID
    raw_document_id: UUID
    partner_id: Optional[UUID]
    delivery_address_id: Optional[UUID]
    invoice_number: Optional[str]
    invoice_date: Optional[date]
    delivery_date: Optional[date]
    currency: Optional[str]
    payment_method: Optional[str]
    recipient_name: Optional[str]
    description: Optional[str]
    total_amount: Optional[Decimal]
    discount_amount: Optional[Decimal]
    tax_amount: Optional[Decimal]
    status: str
    processed_at: datetime
    lines: list[BillLineOut] = []
    pending_count: int = 0
    mapped_count: int = 0
    missing_fields: list[str] = []

    model_config = {"from_attributes": True}


class RawDocumentOut(BaseModel):
    id: UUID
    file_name: str
    document_type: Optional[str]
    ocr_status: str
    ocr_error: Optional[str]
    upload_date: datetime
    extracted_data: Optional[dict[str, Any]]

    model_config = {"from_attributes": True}


class TempCodeMappingOut(BaseModel):
    id: UUID
    temp_code: str
    product_id: Optional[UUID]
    status: str
    first_seen_at: datetime
    last_used_at: datetime

    model_config = {"from_attributes": True}


class MapTempCodeRequest(BaseModel):
    product_id: Optional[UUID] = None
    product_code: Optional[str] = None
    new_product_name: Optional[str] = None
    new_product_uom: Optional[str] = None


class CorrectionCreate(BaseModel):
    field_path: str
    corrected_value: Any


class DocumentTypeOverride(BaseModel):
    document_type: str


class OrderUpdateRequest(BaseModel):
    order_date: Optional[date] = None
    delivery_date: Optional[date] = None
    total_amount: Optional[Decimal] = None
    order_number: Optional[str] = None
    po_number: Optional[str] = None
    partner_id: Optional[UUID] = None
    delivery_address_id: Optional[UUID] = None
    currency: Optional[str] = None
    payment_method: Optional[str] = None
    recipient_name: Optional[str] = None
    description: Optional[str] = None
    discount_amount: Optional[Decimal] = None
    extra_data: Optional[dict] = None
    lines: Optional[list[dict[str, Any]]] = None
