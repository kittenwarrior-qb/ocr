from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime
from decimal import Decimal


class ProductCreate(BaseModel):
    display_name: str
    uom: str
    conversion_factor: Decimal = Decimal("1")
    account_code: Optional[str] = None


class ProductUpdate(BaseModel):
    display_name: Optional[str] = None
    uom: Optional[str] = None
    conversion_factor: Optional[Decimal] = None
    account_code: Optional[str] = None
    is_active: Optional[bool] = None


class ProductOut(BaseModel):
    id: UUID
    code: str
    display_name: str
    uom: str
    conversion_factor: Decimal
    account_code: Optional[str]
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ProductImportRow(BaseModel):
    display_name: str
    uom: str
    code: Optional[str] = None
    conversion_factor: Decimal = Decimal("1")
    account_code: Optional[str] = None
