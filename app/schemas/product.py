from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime
from decimal import Decimal


class ProductCreate(BaseModel):
    display_name: str
    uom: str
    price: Decimal = Decimal("0")
    tax_rate: Optional[Decimal] = None
    property: Optional[str] = None
    product_type: Optional[str] = None
    conversion_factor: Decimal = Decimal("1")
    account_code: Optional[str] = None


class ProductUpdate(BaseModel):
    display_name: Optional[str] = None
    uom: Optional[str] = None
    price: Optional[Decimal] = None
    tax_rate: Optional[Decimal] = None
    property: Optional[str] = None
    product_type: Optional[str] = None
    conversion_factor: Optional[Decimal] = None
    account_code: Optional[str] = None
    is_active: Optional[bool] = None


class ProductOut(BaseModel):
    id: UUID
    code: str
    display_name: str
    uom: str
    price: Decimal
    tax_rate: Optional[Decimal]
    property: Optional[str]
    product_type: Optional[str]
    conversion_factor: Decimal
    account_code: Optional[str]
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ProductImportRow(BaseModel):
    display_name: str
    uom: str
    code: Optional[str] = None
    price: Decimal = Decimal("0")
    tax_rate: Optional[Decimal] = None
    property: Optional[str] = None
    product_type: Optional[str] = None
    conversion_factor: Decimal = Decimal("1")
    account_code: Optional[str] = None
