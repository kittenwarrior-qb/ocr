import math
from datetime import datetime, timezone
import httpx
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.config import settings


def _to_utc_naive(dt: datetime | None) -> datetime | None:
    """
    Normalize an incoming datetime to a naive UTC datetime for storage.
    - tz-aware → convert to UTC, then drop tzinfo
    - naive    → assumed to already be UTC, returned as-is
    This guarantees the DB always holds UTC, so the frontend can safely
    treat tz-less serialized values as UTC.
    """
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt

from app.models.email_order import EmailOrder, EmailAttachment, WebhookLog
from app.schemas.email_order import (
    SyncFromCrawlerIn,
    SyncAttachmentIn,
    WebhookEmailReceivedIn,
)


def list_email_orders(
    db: Session,
    page: int = 1,
    size: int = 20,
    *,
    search: str | None = None,
    recipient: str | None = None,
    domain: str | None = None,
    status: str | None = None,
    date: str | None = None,
) -> dict:
    """
    Paginated email list with optional server-side filters.

    - search:    free-text over sender name/email, recipient, subject (ILIKE)
    - recipient: exact recipient mailbox
    - domain:    sender domain, e.g. "familymart.com" -> sender_email ILIKE '%@familymart.com'
    - status:    "pending" (has pending attachments) | "done" (all attachments done)
    - date:      "YYYY-MM-DD" — emails received on that calendar day
    """
    from sqlalchemy import case, or_, and_, func as sa_func, cast, Date

    att_count = func.count(EmailAttachment.id).label("attachment_count")
    pending_sum = func.sum(case((EmailAttachment.status == "pending", 1), else_=0)).label("pending_count")
    done_sum = func.sum(case((EmailAttachment.status == "done", 1), else_=0)).label("done_count")

    base_q = (
        db.query(EmailOrder, att_count, pending_sum, done_sum)
        .outerjoin(EmailAttachment, EmailAttachment.email_id == EmailOrder.id)
    )

    # --- row-level filters (WHERE) ---
    if search:
        like = f"%{search.strip()}%"
        base_q = base_q.filter(
            or_(
                EmailOrder.sender_name.ilike(like),
                EmailOrder.sender_email.ilike(like),
                EmailOrder.recipient_email.ilike(like),
                EmailOrder.subject.ilike(like),
            )
        )
    if recipient:
        base_q = base_q.filter(EmailOrder.recipient_email == recipient)
    if domain:
        base_q = base_q.filter(EmailOrder.sender_email.ilike(f"%@{domain}"))
    if date:
        base_q = base_q.filter(cast(EmailOrder.received_at, Date) == date)

    base_q = base_q.group_by(EmailOrder.id)

    # --- aggregate filters (HAVING) ---
    if status == "pending":
        base_q = base_q.having(pending_sum > 0)
    elif status == "done":
        base_q = base_q.having(and_(att_count > 0, done_sum == att_count))

    # total must reflect the same filters (wrap the filtered query in a subquery)
    total = db.query(sa_func.count()).select_from(base_q.subquery()).scalar() or 0

    skip = (page - 1) * size
    rows = (
        base_q.order_by(EmailOrder.received_at.desc().nullslast())
        .offset(skip)
        .limit(size)
        .all()
    )

    items = []
    for email, a_count, pending, done in rows:
        items.append({
            "id": email.id,
            "external_id": email.external_id,
            "sender_email": email.sender_email,
            "sender_name": email.sender_name,
            "recipient_email": email.recipient_email,
            "subject": email.subject,
            "received_at": email.received_at,
            "created_at": email.created_at,
            "attachment_count": a_count or 0,
            "pending_count": int(pending or 0),
            "done_count": int(done or 0),
        })

    pages = math.ceil(total / size) if size > 0 else 1
    return {"items": items, "total": total, "page": page, "size": size, "pages": max(pages, 1)}


def get_email_facets(db: Session) -> dict:
    """
    Distinct values used to populate filter UI (company chips, recipient dropdown).
    Computed over the whole table so the options don't shrink with pagination.
    """
    # count emails per sender domain
    domain_counts: dict[str, int] = {}
    for (sender_email,) in db.query(EmailOrder.sender_email).all():
        if not sender_email:
            continue
        at = sender_email.rfind("@")
        dom = sender_email[at + 1:].lower() if at != -1 else sender_email.lower()
        domain_counts[dom] = domain_counts.get(dom, 0) + 1

    recipients = [
        r[0]
        for r in db.query(EmailOrder.recipient_email)
        .filter(EmailOrder.recipient_email.isnot(None))
        .distinct()
        .order_by(EmailOrder.recipient_email)
        .all()
    ]

    domains = [
        {"domain": d, "count": c}
        for d, c in sorted(domain_counts.items(), key=lambda kv: kv[0])
    ]
    return {"domains": domains, "recipients": recipients}


def get_email_order(db: Session, email_id: int) -> EmailOrder | None:
    return db.query(EmailOrder).filter(EmailOrder.id == email_id).first()


def upsert_from_crawler(db: Session, payload: SyncFromCrawlerIn) -> EmailOrder:
    """
    Upsert an email + its attachments coming from the external crawler service.

    Race-safe: if two webhook deliveries for the same message_id arrive almost
    simultaneously, both may pass the initial SELECT and try to INSERT. The
    unique constraint on `external_id` makes the second INSERT raise
    IntegrityError; we catch it, roll back, and re-select the row the other
    request committed.
    """
    from sqlalchemy.exc import IntegrityError

    email = db.query(EmailOrder).filter(EmailOrder.external_id == payload.external_id).first()
    if not email:
        email = EmailOrder(
            external_id=payload.external_id,
            sender_email=payload.sender_email,
            sender_name=payload.sender_name,
            recipient_email=payload.recipient_email,
            subject=payload.subject,
            received_at=_to_utc_naive(payload.received_at),
        )
        db.add(email)
        try:
            db.flush()
        except IntegrityError:
            # Another concurrent request inserted the same email first.
            db.rollback()
            email = (
                db.query(EmailOrder)
                .filter(EmailOrder.external_id == payload.external_id)
                .first()
            )
            if email is None:
                # Extremely unlikely; surface the original problem instead of looping.
                raise

    existing_ext_ids = {
        a.external_attachment_id
        for a in db.query(EmailAttachment.external_attachment_id)
        .filter(EmailAttachment.email_id == email.id)
        .all()
    }

    for att in payload.attachments:
        if att.external_attachment_id in existing_ext_ids:
            continue
        db.add(EmailAttachment(
            email_id=email.id,
            external_attachment_id=att.external_attachment_id,
            filename=att.filename,
            file_size=att.file_size,
            download_url=att.download_url,
            view_url=att.view_url,
            status="pending",
        ))

    db.commit()
    db.refresh(email)
    return email


def upsert_from_webhook(db: Session, payload: WebhookEmailReceivedIn) -> EmailOrder:
    """
    Map an incoming `email.received` webhook payload onto our DB model.
    Reuses upsert_from_crawler so the upsert/dedup logic lives in one place.
    """
    mapped = SyncFromCrawlerIn(
        external_id=payload.message_id,
        sender_email=payload.sender_email,
        sender_name=payload.sender_name,
        recipient_email=payload.recipient_email,
        subject=payload.subject,
        received_at=payload.received_at,
        attachments=[
            SyncAttachmentIn(
                external_attachment_id=a.id,
                filename=a.filename,
                file_size=a.file_size,
                download_url=a.download_url,
                view_url=a.view_url,
            )
            for a in payload.attachments
        ],
    )
    return upsert_from_crawler(db, mapped)


def backfill_from_gateway(db: Session, size: int = 50) -> dict:
    """
    Pull *all* emails from the external Email Gateway and upsert them into our DB.

    The Gateway is the source of truth for raw emails; our DB additionally tracks
    per-attachment OCR status (pending/processing/done). The webhook only delivers
    emails that arrive *after* it was wired up, so historical emails never make it
    in. This endpoint backfills the gap by paging through the whole Gateway list.

    Idempotent: relies on upsert_from_crawler's dedup (unique external_id +
    skip-existing external_attachment_id), so running it repeatedly is safe.

    Returns a summary: {"synced": int, "total": int, "pages": int}.
    """
    base = settings.EMAIL_GATEWAY_URL.rstrip("/")
    synced = 0
    total = 0
    pages = 1

    with httpx.Client(timeout=30.0) as http:
        page = 1
        while True:
            resp = http.get(f"{base}/emails", params={"page": page, "size": size})
            resp.raise_for_status()
            data = resp.json()
            items = data.get("items", [])
            total = data.get("total", total)
            pages = data.get("pages", pages)

            for item in items:
                # Always fetch full detail so attachments are included.
                detail_resp = http.get(f"{base}/emails/{item['id']}")
                detail_resp.raise_for_status()
                full = detail_resp.json()

                mapped = SyncFromCrawlerIn(
                    external_id=full["message_id"],
                    sender_email=full["sender_email"],
                    sender_name=full.get("sender_name"),
                    recipient_email=full.get("recipient_email"),
                    subject=full.get("subject"),
                    received_at=full.get("received_at"),
                    attachments=[
                        SyncAttachmentIn(
                            external_attachment_id=a["id"],
                            filename=a["filename"],
                            file_size=a.get("file_size"),
                            download_url=a.get("download_url"),
                            view_url=a.get("view_url"),
                        )
                        for a in (full.get("attachments") or [])
                    ],
                )
                upsert_from_crawler(db, mapped)
                synced += 1

            if page >= pages or not items:
                break
            page += 1

    return {"synced": synced, "total": total, "pages": pages}


def log_webhook_received(db: Session, event: str | None, external_id: str | None, payload: dict) -> int:
    """Persist an incoming webhook immediately and return its log id."""
    log = WebhookLog(
        event=event,
        external_id=external_id,
        payload=payload,
        status="received",
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log.id


def _finish_webhook_log(
    db: Session, log_id: int, status: str, email_id: int | None = None, error: str | None = None
) -> None:
    log = db.query(WebhookLog).filter(WebhookLog.id == log_id).first()
    if not log:
        return
    log.status = status
    log.email_id = email_id
    log.error = error
    log.processed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()


def process_webhook(log_id: int, payload: WebhookEmailReceivedIn) -> None:
    """
    Background worker: process a previously-logged webhook payload.
    Opens its own DB session (background tasks must not reuse the request session).
    Updates the WebhookLog row with the final outcome.
    """
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        if payload.event != "email.received":
            _finish_webhook_log(db, log_id, "ignored")
            return
        email = upsert_from_webhook(db, payload)
        _finish_webhook_log(db, log_id, "processed", email_id=email.id)
    except Exception as e:  # noqa: BLE001 — log any failure for later inspection
        db.rollback()
        _finish_webhook_log(db, log_id, "failed", error=str(e))
    finally:
        db.close()


def list_webhook_logs(db: Session, skip: int = 0, limit: int = 50) -> list[WebhookLog]:
    return (
        db.query(WebhookLog)
        .order_by(WebhookLog.received_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def set_attachment_processing(db: Session, attachment_id: int) -> EmailAttachment | None:
    att = db.query(EmailAttachment).filter(EmailAttachment.id == attachment_id).first()
    # Allow converting from any status: "pending" (first time), "processing"
    # (re-run while still working) or "done" (re-convert after an error).
    if not att:
        return None
    att.status = "processing"
    att.converted_at = datetime.now(timezone.utc).replace(tzinfo=None)
    att.done_at = None
    db.commit()
    db.refresh(att)
    return att


def set_attachment_done(db: Session, attachment_id: int) -> EmailAttachment | None:
    att = db.query(EmailAttachment).filter(EmailAttachment.id == attachment_id).first()
    if not att or att.status != "processing":
        return att
    att.status = "done"
    att.done_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    db.refresh(att)
    return att


def bulk_set_processing(db: Session, attachment_ids: list[int]) -> list[EmailAttachment]:
    atts = (
        db.query(EmailAttachment)
        .filter(
            EmailAttachment.id.in_(attachment_ids),
            EmailAttachment.status.in_(("pending", "done")),
        )
        .all()
    )
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    for att in atts:
        att.status = "processing"
        att.converted_at = now
        att.done_at = None
    db.commit()
    return atts
