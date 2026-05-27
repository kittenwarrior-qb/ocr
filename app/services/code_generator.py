from sqlalchemy.orm import Session
from app.models.sys_config import SysConfig, DEFAULT_CONFIGS


def _next_code(db: Session, prefix_key: str) -> str:
    config = (
        db.query(SysConfig)
        .filter(SysConfig.config_key == prefix_key)
        .with_for_update()
        .first()
    )
    if config is None:
        raise ValueError(f"Config key '{prefix_key}' not found. Run init_default_configs() first.")
    config.last_number += 1
    db.flush()
    return f"{config.config_value}{config.last_number:04d}"


def generate_partner_code(db: Session, partner_type: str) -> str:
    key = "partner_customer_prefix" if partner_type == "customer" else "partner_vendor_prefix"
    return _next_code(db, key)


def generate_product_code(db: Session) -> str:
    return _next_code(db, "product_prefix")


def generate_address_code(db: Session) -> str:
    return _next_code(db, "address_prefix")


def generate_template_code(db: Session) -> str:
    return _next_code(db, "template_prefix")


def init_default_configs(db: Session) -> None:
    for key, value in DEFAULT_CONFIGS:
        exists = db.query(SysConfig).filter(SysConfig.config_key == key).first()
        if not exists:
            db.add(SysConfig(config_key=key, config_value=value, last_number=0))
    db.commit()
