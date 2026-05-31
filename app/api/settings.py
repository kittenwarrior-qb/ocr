from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.sys_config import SysConfig
from app.schemas.settings import PrefixUpdate, SMTPUpdate, SysConfigOut
from app.services.document_service import get_dashboard_stats

router = APIRouter(prefix="/settings", tags=["Settings"])

SMTP_KEYS = ("smtp_host", "smtp_port", "smtp_user", "smtp_password", "notification_email")


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


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db)):
    return get_dashboard_stats(db)
