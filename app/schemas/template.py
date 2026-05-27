from pydantic import BaseModel
from typing import Optional, Any
from uuid import UUID
from datetime import datetime

# field_aliases: {"payment_method": ["HTTT", "P.thức TT"], "recipient_name": ["NNH", "Người nhận"]}
FieldAliases = dict[str, list[str]]


class TemplateCreate(BaseModel):
    partner_id: Optional[UUID] = None
    document_type: str
    name: str
    system_prompt: Optional[str] = None
    output_schema: dict[str, Any] = {}
    field_aliases: Optional[FieldAliases] = None


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    system_prompt: Optional[str] = None
    output_schema: Optional[dict[str, Any]] = None
    field_aliases: Optional[FieldAliases] = None
    is_active: Optional[bool] = None


class TemplateOut(BaseModel):
    id: UUID
    code: str
    partner_id: Optional[UUID]
    partner_name: Optional[str] = None
    document_type: str
    name: str
    system_prompt: str
    output_schema: dict[str, Any]
    field_aliases: Optional[FieldAliases]
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class TemplateSuggestion(BaseModel):
    suggested_fields: dict[str, Any]
    raw_extracted: dict[str, Any]
    suggested_aliases: dict[str, list[str]]
