from fastapi import APIRouter, Depends, HTTPException
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


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db)):
    return get_dashboard_stats(db)
