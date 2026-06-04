from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.email_order import (
    EmailOrderOut,
    EmailOrderListItem,
    EmailAttachmentOut,
    SyncFromCrawlerIn,
    BulkConvertIn,
    WebhookEmailReceivedIn,
    WebhookLogOut,
)
from app.services import email_order_service as svc

router = APIRouter(prefix="/email-orders", tags=["email-orders"])


@router.get("", response_model=list[EmailOrderListItem])
def list_email_orders(skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    return svc.list_email_orders(db, skip=skip, limit=limit)


@router.get("/webhook-logs", response_model=list[WebhookLogOut])
def list_webhook_logs(skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    """Inspect recent webhook deliveries (for debugging). Must be declared before /{email_id}."""
    return svc.list_webhook_logs(db, skip=skip, limit=limit)


@router.get("/{email_id}", response_model=EmailOrderOut)
def get_email_order(email_id: int, db: Session = Depends(get_db)):
    email = svc.get_email_order(db, email_id)
    if not email:
        raise HTTPException(status_code=404, detail="Email order not found")
    return email


@router.post("/sync", response_model=EmailOrderOut, status_code=201)
def sync_from_crawler(payload: SyncFromCrawlerIn, db: Session = Depends(get_db)):
    """Upsert an email + attachments received from the external crawler service."""
    return svc.upsert_from_crawler(db, payload)


@router.post("/webhook")
def receive_webhook(
    payload: WebhookEmailReceivedIn,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Entry point for the Email Gateway webhook (event: email.received).
    The Gateway crawls every 5 minutes and pushes new emails here.
    No signature verification (per current setup).

    Flow:
      1. Log the raw payload synchronously (fast, always succeeds).
      2. Schedule the actual upsert as a background task.
      3. Return 200 immediately so the Gateway never times out / retries.

    The WebhookLog row records the final outcome (processed / ignored / failed).
    """
    log_id = svc.log_webhook_received(
        db,
        event=payload.event,
        external_id=payload.message_id,
        payload=payload.model_dump(mode="json"),
    )
    background_tasks.add_task(svc.process_webhook, log_id, payload)
    return {"status": "accepted", "log_id": log_id}


# --- Attachment status transitions ---

@router.post("/attachments/{attachment_id}/convert", response_model=EmailAttachmentOut)
def convert_attachment(attachment_id: int, db: Session = Depends(get_db)):
    """Mark attachment as processing (pending → processing)."""
    att = svc.set_attachment_processing(db, attachment_id)
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found")
    return att


@router.post("/attachments/{attachment_id}/done", response_model=EmailAttachmentOut)
def done_attachment(attachment_id: int, db: Session = Depends(get_db)):
    """User confirms OCR result — mark attachment as done (processing → done)."""
    att = svc.set_attachment_done(db, attachment_id)
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found")
    return att


@router.post("/attachments/bulk-convert", response_model=list[EmailAttachmentOut])
def bulk_convert(payload: BulkConvertIn, db: Session = Depends(get_db)):
    """Mark multiple attachments as processing at once (multi-select Convert)."""
    return svc.bulk_set_processing(db, payload.attachment_ids)
