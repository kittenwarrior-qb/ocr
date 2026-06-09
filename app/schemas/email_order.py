from __future__ import annotations
from datetime import datetime
from typing import Literal
from pydantic import BaseModel

AttachmentStatus = Literal["pending", "processing", "done"]


class EmailAttachmentOut(BaseModel):
    id: int
    email_id: int
    external_attachment_id: int | None
    filename: str
    file_size: int | None
    download_url: str | None
    view_url: str | None
    status: AttachmentStatus
    converted_at: datetime | None
    done_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class EmailOrderOut(BaseModel):
    id: int
    external_id: str | None
    sender_email: str
    sender_name: str | None
    recipient_email: str | None
    subject: str | None
    received_at: datetime | None
    created_at: datetime
    attachments: list[EmailAttachmentOut] = []

    model_config = {"from_attributes": True}


class EmailOrderListItem(BaseModel):
    """Lightweight item for list view — no attachments embedded."""
    id: int
    external_id: str | None
    sender_email: str
    sender_name: str | None
    recipient_email: str | None
    subject: str | None
    received_at: datetime | None
    created_at: datetime
    attachment_count: int
    pending_count: int
    done_count: int

    model_config = {"from_attributes": True}


class SyncFromCrawlerIn(BaseModel):
    """Payload to upsert emails from the external crawler service."""
    external_id: str
    sender_email: str
    sender_name: str | None = None
    recipient_email: str | None = None
    subject: str | None = None
    received_at: datetime | None = None
    attachments: list[SyncAttachmentIn] = []


class SyncAttachmentIn(BaseModel):
    external_attachment_id: int
    filename: str
    file_size: int | None = None
    download_url: str | None = None
    view_url: str | None = None


SyncFromCrawlerIn.model_rebuild()


class AttachmentStatusPatch(BaseModel):
    status: AttachmentStatus


class EmailOrderListResponse(BaseModel):
    items: list[EmailOrderListItem]
    total: int
    page: int
    size: int
    pages: int


class BulkConvertIn(BaseModel):
    attachment_ids: list[int]


# --- Incoming webhook payload from Email Gateway (event: email.received) ---

class WebhookAttachmentIn(BaseModel):
    id: int
    filename: str
    mime_type: str | None = None
    file_size: int | None = None
    download_url: str | None = None
    view_url: str | None = None


class WebhookEmailReceivedIn(BaseModel):
    event: str
    email_id: int
    message_id: str
    sender_email: str
    sender_name: str | None = None
    recipient_email: str | None = None
    subject: str | None = None
    received_at: datetime | None = None
    attachments: list[WebhookAttachmentIn] = []


class WebhookLogOut(BaseModel):
    id: int
    event: str | None
    external_id: str | None
    status: str
    error: str | None
    email_id: int | None
    received_at: datetime
    processed_at: datetime | None

    model_config = {"from_attributes": True}
