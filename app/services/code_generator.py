from sqlalchemy.orm import Session
from app.models.sys_config import SysConfig, DEFAULT_CONFIGS

ORDER_PREFIX = "DH"


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
    """Generate order number with format DH0000001.

    The counter is reconciled with persisted orders so a reset or stale
    sys_config row cannot reuse an existing order number after deploy.
    """
    from app.database import SessionLocal
    from app.models.document import ProcessedOrder

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
        raw_prefix = (config.config_value or ORDER_PREFIX).rstrip("_")
        prefix = ORDER_PREFIX if raw_prefix.upper().startswith("OCR") else (raw_prefix or ORDER_PREFIX)
        latest = (
            counter_db.query(ProcessedOrder.order_number)
            .filter(ProcessedOrder.order_number.like(f"{prefix}%"))
            .order_by(ProcessedOrder.order_number.desc())
            .all()
        )
        last_from_orders = 0
        for (order_number,) in latest:
            suffix = str(order_number or "")[len(prefix):]
            if suffix.isdigit():
                last_from_orders = max(last_from_orders, int(suffix))
        num = max(config.last_number or 0, last_from_orders) + 1
        config.config_value = prefix
        config.last_number = num
        counter_db.commit()
    finally:
        counter_db.close()
    return f"{prefix}{num:07d}"


def init_default_configs(db: Session) -> None:
    for key, value in DEFAULT_CONFIGS:
        exists = db.query(SysConfig).filter(SysConfig.config_key == key).first()
        if not exists:
            db.add(SysConfig(config_key=key, config_value=value, last_number=0))
    db.commit()
    reconcile_order_number_config(db)


def reconcile_order_number_config(db: Session) -> None:
    """Keep persisted order numbering on the DH0000001 sequence."""
    from app.models.document import ProcessedOrder

    config = db.query(SysConfig).filter(SysConfig.config_key == "order_prefix").with_for_update().first()
    if not config:
        config = SysConfig(config_key="order_prefix", config_value=ORDER_PREFIX, last_number=0)
        db.add(config)
        db.flush()

    used = {
        order_number
        for (order_number,) in db.query(ProcessedOrder.order_number).filter(ProcessedOrder.order_number.isnot(None)).all()
    }

    next_number = 1
    ocr_orders = (
        db.query(ProcessedOrder)
        .filter(ProcessedOrder.order_number.ilike("OCR%"))
        .order_by(ProcessedOrder.processed_at.asc(), ProcessedOrder.id.asc())
        .all()
    )
    for order in ocr_orders:
        old_number = order.order_number or ""
        suffix = old_number[3:]
        if suffix.isdigit():
            candidate_number = int(suffix)
        else:
            candidate_number = next_number

        new_number = f"{ORDER_PREFIX}{candidate_number:07d}"
        while new_number in used and new_number != old_number:
            candidate_number += 1
            new_number = f"{ORDER_PREFIX}{candidate_number:07d}"

        used.discard(old_number)
        used.add(new_number)
        order.order_number = new_number
        next_number = max(next_number, candidate_number + 1)

    max_dh_number = 0
    for order_number in used:
        if not order_number or not order_number.startswith(ORDER_PREFIX):
            continue
        suffix = order_number[len(ORDER_PREFIX):]
        if suffix.isdigit():
            max_dh_number = max(max_dh_number, int(suffix))

    config.config_value = ORDER_PREFIX
    config.last_number = max_dh_number
    db.commit()
