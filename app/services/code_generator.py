from sqlalchemy.orm import Session
from app.models.sys_config import SysConfig, DEFAULT_CONFIGS


def _next_code(db: Session, prefix_key: str) -> str:
    """Generate next sequential code. Uses separate transaction to avoid blocking concurrent workers."""
    from app.database import SessionLocal
    counter_db = SessionLocal()
    try:
        config = (
            counter_db.query(SysConfig)
            .filter(SysConfig.config_key == prefix_key)
            .with_for_update()
            .first()
        )
        if config is None:
            raise ValueError(f"Config key '{prefix_key}' not found. Run init_default_configs() first.")
        config.last_number += 1
        num = config.last_number
        prefix = config.config_value
        counter_db.commit()
    finally:
        counter_db.close()
    return f"{prefix}{num:04d}"


def generate_partner_code(db: Session, partner_type: str) -> str:
    key = "partner_customer_prefix" if partner_type == "customer" else "partner_vendor_prefix"
    return _next_code(db, key)


def generate_product_code(db: Session) -> str:
    return _next_code(db, "product_prefix")


def generate_address_code(db: Session) -> str:
    return _next_code(db, "address_prefix")


def generate_template_code(db: Session) -> str:
    return _next_code(db, "template_prefix")


def generate_order_number(db: Session) -> str:
    """Generate order number with format OCR0000001. Uses separate transaction to avoid blocking."""
    from app.database import SessionLocal
    counter_db = SessionLocal()
    try:
        config = (
            counter_db.query(SysConfig)
            .filter(SysConfig.config_key == "order_prefix")
            .with_for_update()
            .first()
        )
        if config is None:
            raise ValueError("Config key 'order_prefix' not found. Run init_default_configs() first.")
        config.last_number += 1
        num = config.last_number
        counter_db.commit()
    finally:
        counter_db.close()
    return f"OCR{num:07d}"


def init_default_configs(db: Session) -> None:
    for key, value in DEFAULT_CONFIGS:
        exists = db.query(SysConfig).filter(SysConfig.config_key == key).first()
        if not exists:
            db.add(SysConfig(config_key=key, config_value=value, last_number=0))
    db.commit()
