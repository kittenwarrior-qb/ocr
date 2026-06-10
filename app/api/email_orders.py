import httpx
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.schemas.email_order import (
    EmailOrderOut,
    EmailOrderListResponse,
    EmailAttachmentOut,
    SyncFromCrawlerIn,
    BulkConvertIn,
    WebhookEmailReceivedIn,
    WebhookLogOut,
)
from app.services import email_order_service as svc

router = APIRouter(prefix="/email-orders", tags=["email-orders"])


@router.get("", response_model=EmailOrderListResponse)
def list_email_orders(
    page: int = 1,
    size: int = 20,
    search: str | None = None,
    recipient: str | None = None,
    domain: str | None = None,
    status: str | None = None,
    date: str | None = None,
    db: Session = Depends(get_db),
):
    return svc.list_email_orders(
        db,
        page=page,
        size=size,
        search=search,
        recipient=recipient,
        domain=domain,
        status=status,
        date=date,
    )


@router.get("/facets")
def email_facets(db: Session = Depends(get_db)):
    """Distinct domains + recipients for filter UI. Declared before /{email_id}."""
    return svc.get_email_facets(db)


@router.get("/webhook-logs", response_model=list[WebhookLogOut])
def list_webhook_logs(skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    """Inspect recent webhook deliveries (for debugging). Must be declared before /{email_id}."""
    return svc.list_webhook_logs(db, skip=skip, limit=limit)


@router.post("/backfill")
def backfill(db: Session = Depends(get_db)):
    """
    Pull all emails from the external Email Gateway into our DB.
    Idempotent — safe to run repeatedly. Declared before /{email_id} so the
    literal path isn't captured by the dynamic route.
    """
    return svc.backfill_from_gateway(db)


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

@router.get("/attachments/{attachment_id}/view")
async def view_attachment(attachment_id: int, db: Session = Depends(get_db)):
    """Proxy attachment PDF from the email gateway with Content-Disposition: inline so the
    browser renders it inside an <iframe> instead of triggering a download."""
    att = svc.get_attachment(db, attachment_id)
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found")

    url = att.view_url
    if not url and att.external_attachment_id is not None:
        base = settings.EMAIL_GATEWAY_URL.rstrip("/")
        url = f"{base}/attachments/{att.external_attachment_id}/view"
    if not url:
        raise HTTPException(status_code=404, detail="No view URL available for this attachment")

    try:
        async with httpx.AsyncClient(timeout=30.0) as http:
            r = await http.get(url)
            r.raise_for_status()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Gateway returned {e.response.status_code}")
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Gateway unreachable: {e}")

    return Response(
        content=r.content,
        media_type="application/pdf",
        headers={"content-disposition": "inline"},
    )


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
