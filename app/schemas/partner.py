from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime


class PartnerAddressOut(BaseModel):
    id: UUID
    code: str
    display_name: Optional[str]
    address_type: str
    full_address: Optional[str]
    mapping_key: Optional[str]

    model_config = {"from_attributes": True}


class PartnerOut(BaseModel):
    id: UUID
    code: str
    display_name: Optional[str]
    partner_type: str
    legal_name: str
    tax_code: Optional[str]
    address: Optional[str]
    is_active: bool
    created_at: datetime
    addresses: list[PartnerAddressOut] = []

    model_config = {"from_attributes": True}


class PartnerUpdate(BaseModel):
    display_name: Optional[str] = None
    tax_code: Optional[str] = None
    address: Optional[str] = None
    is_active: Optional[bool] = None


class PartnerAddressUpdate(BaseModel):
    display_name: Optional[str] = None
    address_type: Optional[str] = None
    full_address: Optional[str] = None
    mapping_key: Optional[str] = None
