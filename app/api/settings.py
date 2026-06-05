from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.sys_config import SysConfig
from app.schemas.settings import MisaSettingsUpdate, PrefixUpdate, SMTPUpdate, SysConfigOut
from app.services.document_service import get_dashboard_stats

router = APIRouter(prefix="/settings", tags=["Settings"])

SMTP_KEYS = ("smtp_host", "smtp_port", "smtp_user", "smtp_password", "notification_email")
MISA_APP_ID_KEY = "misa_app_id"
MISA_SECRET_KEY = "misa_client_secret"


def _get_config(db: Session, key: str) -> SysConfig | None:
    return db.query(SysConfig).filter(SysConfig.config_key == key).first()


def _upsert_config(db: Session, key: str, value: str):
    row = _get_config(db, key)
    if row:
        row.config_value = value
    else:
        db.add(SysConfig(config_key=key, config_value=value, last_number=0))


def _mask_secret(value: str) -> str:
    if not value:
        return ""
    return f"{value[:6]}...{value[-4:]}" if len(value) > 12 else "***"


@router.get("/configs", response_model=list[SysConfigOut])
def get_configs(db: Session = Depends(get_db)):
    return db.query(SysConfig).order_by(SysConfig.config_key).all()


@router.patch("/prefixes")
def update_prefixes(body: PrefixUpdate, db: Session = Depends(get_db)):
    mapping = {
        "partner_customer_prefix": body.partner_customer_prefix,
        "partner_vendor_prefix": body.partner_vendor_prefix,
        "product_prefix": body.product_prefix,
        "address_prefix": body.address_prefix,
        "template_prefix": body.template_prefix,
    }
    updated = []
    for key, value in mapping.items():
        if value is None:
            continue
        config = db.query(SysConfig).filter(SysConfig.config_key == key).first()
        if not config:
            raise HTTPException(status_code=404, detail=f"Config key '{key}' not found")
        if config.last_number > 0:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot change prefix for '{key}' after codes have been issued (last_number={config.last_number})",
            )
        config.config_value = value
        updated.append(key)
    db.commit()
    return {"updated": updated}


@router.patch("/smtp")
def update_smtp(body: SMTPUpdate, db: Session = Depends(get_db)):
    mapping = {
        "smtp_host": body.smtp_host,
        "smtp_port": str(body.smtp_port) if body.smtp_port else None,
        "smtp_user": body.smtp_user,
        "smtp_password": body.smtp_password,
        "notification_email": body.notification_email,
    }
    for key, value in mapping.items():
        if value is None:
            continue
        config = db.query(SysConfig).filter(SysConfig.config_key == key).first()
        if config:
            config.config_value = value
        else:
            db.add(SysConfig(config_key=key, config_value=value, last_number=0))
    db.commit()
    return {"message": "SMTP settings updated"}


@router.get("/ocr")
def get_ocr_settings(db: Session = Depends(get_db)):
    """Get current OCR provider settings."""
    from app.config import settings as env_settings
    key_row = db.query(SysConfig).filter(SysConfig.config_key == "openrouter_api_key").first()
    model_row = db.query(SysConfig).filter(SysConfig.config_key == "openrouter_model").first()
    api_key = key_row.config_value if key_row else env_settings.OPENROUTER_API_KEY
    model = model_row.config_value if model_row else env_settings.OPENROUTER_MODEL
    # Mask key for display
    masked = f"{api_key[:12]}...{api_key[-4:]}" if len(api_key) > 16 else ("***" if api_key else "")
    return {"api_key_masked": masked, "model": model, "has_key": bool(api_key)}


@router.patch("/ocr")
def update_ocr_settings(body: dict = Body(...), db: Session = Depends(get_db)):
    """Update OCR API key and/or model. Stored in DB so no restart needed."""
    if "api_key" in body and body["api_key"]:
        row = db.query(SysConfig).filter(SysConfig.config_key == "openrouter_api_key").first()
        if row:
            row.config_value = body["api_key"]
        else:
            db.add(SysConfig(config_key="openrouter_api_key", config_value=body["api_key"], last_number=0))
    if "model" in body and body["model"]:
        row = db.query(SysConfig).filter(SysConfig.config_key == "openrouter_model").first()
        if row:
            row.config_value = body["model"]
        else:
            db.add(SysConfig(config_key="openrouter_model", config_value=body["model"], last_number=0))
    db.commit()
    return {"message": "OCR settings updated"}


@router.get("/misa")
def get_misa_settings(db: Session = Depends(get_db)):
    """Get MISA credential status. Secret is never returned raw."""
    from app.config import settings as env_settings

    app_id_row = _get_config(db, MISA_APP_ID_KEY)
    secret_row = _get_config(db, MISA_SECRET_KEY)
    app_id = app_id_row.config_value if app_id_row else env_settings.APP_ID
    secret = secret_row.config_value if secret_row else env_settings.MISA_CLIENT_SECRET
    return {
        "app_id": app_id,
        "client_secret_masked": _mask_secret(secret),
        "has_client_secret": bool(secret),
    }


@router.get("/misa/secret")
def get_misa_secret(db: Session = Depends(get_db)):
    """Return current MISA secret for admin copy action."""
    from app.config import settings as env_settings

    secret_row = _get_config(db, MISA_SECRET_KEY)
    secret = secret_row.config_value if secret_row else env_settings.MISA_CLIENT_SECRET
    if not secret:
        raise HTTPException(status_code=404, detail="Chưa có Secret MISA")
    return {"client_secret": secret}


@router.patch("/misa")
def update_misa_settings(body: MisaSettingsUpdate, db: Session = Depends(get_db)):
    """Update MISA app id and/or secret. Blank secret means keep existing secret."""
    updated = []
    if body.app_id is not None:
        app_id = body.app_id.strip()
        if not app_id:
            raise HTTPException(status_code=400, detail="APP ID không được để trống")
        _upsert_config(db, MISA_APP_ID_KEY, app_id)
        updated.append("app_id")

    if body.client_secret is not None and body.client_secret.strip():
        _upsert_config(db, MISA_SECRET_KEY, body.client_secret.strip())
        updated.append("client_secret")

    if not updated:
        raise HTTPException(status_code=400, detail="Không có thay đổi để lưu")

    db.commit()

    from app.services.misa_client import misa_client
    misa_client.invalidate_token()
    return {"message": "MISA settings updated", "updated": updated}


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db)):
    return get_dashboard_stats(db)
