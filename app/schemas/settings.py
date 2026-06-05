from pydantic import BaseModel
from typing import Optional


class SysConfigOut(BaseModel):
    config_key: str
    config_value: str
    last_number: int

    model_config = {"from_attributes": True}


class PrefixUpdate(BaseModel):
    partner_customer_prefix: Optional[str] = None
    partner_vendor_prefix: Optional[str] = None
    product_prefix: Optional[str] = None
    address_prefix: Optional[str] = None
    template_prefix: Optional[str] = None


class SMTPUpdate(BaseModel):
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None
    notification_email: Optional[str] = None


class MisaSettingsUpdate(BaseModel):
    app_id: Optional[str] = None
    client_secret: Optional[str] = None
