"""
Seed database with products and customers from JSON files.
Clears existing data first for a clean slate.

Usage:
  python -m app.seed

In Docker:
  docker compose exec backend python -m app.seed
  docker compose -f docker-compose.prod.yml exec backend python -m app.seed

Data files required in: app/data/products.json, app/data/customers.json
"""
import json
import sys
from decimal import Decimal
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"
customers_path = DATA_DIR / "customers.json"
products_path = DATA_DIR / "products.json"

for p in (customers_path, products_path):
    if not p.exists():
        print(f"ERROR: {p} not found")
        print(f"Place your JSON data files in: {DATA_DIR}")
        sys.exit(1)

customers = json.loads(customers_path.read_text(encoding="utf-8"))
products = json.loads(products_path.read_text(encoding="utf-8"))
print(f"Loaded {len(customers)} customers, {len(products)} products")


def _parse_decimal(value, default="0"):
    if value is None or value == "":
        return Decimal(default)
    text = str(value).strip().replace(",", ".").replace("%", "")
    if not text:
        return Decimal(default)
    return Decimal(text)


def main():
    from sqlalchemy import text
    from app.database import SessionLocal, engine
    from app.models.partner import Partner, PartnerAddress
    from app.models.product import Product
    from app.models.mapping import MSTMapping, TempCodeMapping
    from app.models.document import ProcessedOrder, ProcessedBill, OrderLine, BillLine, RawDocument
    from app.models.session import OcrSession
    from app.models.sys_config import SysConfig
    from app.models.template import Template
    from app.models import Base

    # Ensure ALL tables exist
    Base.metadata.create_all(bind=engine)

    # Run essential migrations
    migrations = [
        "ALTER TABLE processed_orders ADD COLUMN IF NOT EXISTS extra_data JSONB DEFAULT '{}'::jsonb",
        "ALTER TABLE processed_orders ADD COLUMN IF NOT EXISTS order_number VARCHAR(100)",
        "ALTER TABLE processed_orders ADD COLUMN IF NOT EXISTS delivery_date DATE",
        "ALTER TABLE processed_orders ADD COLUMN IF NOT EXISTS currency VARCHAR(10)",
        "ALTER TABLE processed_orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(200)",
        "ALTER TABLE processed_orders ADD COLUMN IF NOT EXISTS recipient_name VARCHAR(200)",
        "ALTER TABLE processed_orders ADD COLUMN IF NOT EXISTS description TEXT",
        "ALTER TABLE processed_orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(18,2)",
        "ALTER TABLE processed_orders ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(18,2)",
        "ALTER TABLE processed_orders ADD COLUMN IF NOT EXISTS missing_fields JSONB DEFAULT '[]'",
        "ALTER TABLE order_lines ADD COLUMN IF NOT EXISTS discount_rate NUMERIC(5,2)",
        "ALTER TABLE order_lines ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(18,2)",
        "ALTER TABLE order_lines ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2)",
        "ALTER TABLE order_lines ADD COLUMN IF NOT EXISTS ocr_product_code VARCHAR(200)",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS price NUMERIC(18,2) NOT NULL DEFAULT 0",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2)",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS property VARCHAR(100)",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type VARCHAR(100)",
        "ALTER TABLE raw_documents ADD COLUMN IF NOT EXISTS session_id UUID",
        "ALTER TABLE partners ADD COLUMN IF NOT EXISTS phone VARCHAR(50)",
        "ALTER TABLE partners ADD COLUMN IF NOT EXISTS email VARCHAR(300)",
        "ALTER TABLE partners ADD COLUMN IF NOT EXISTS field VARCHAR(200)",
        "ALTER TABLE partners ADD COLUMN IF NOT EXISTS owner VARCHAR(200)",
        "ALTER TABLE partners ADD COLUMN IF NOT EXISTS description TEXT",
    ]
    with engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(text(sql))
            except Exception:
                pass
        conn.commit()

    # Ensure sys_config defaults exist
    from app.services.code_generator import init_default_configs
    db = SessionLocal()
    try:
        init_default_configs(db)
    except Exception:
        db.rollback()
    db.close()

    # ── Reset ─────────────────────────────────────────────────────────────────
    print("\n--- Resetting database ---")
    with engine.connect() as conn:
        # Get all user tables and truncate them (except sys_config)
        tables = conn.execute(text(
            "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename != 'sys_config'"
        )).fetchall()
        table_names = [t[0] for t in tables]
        if table_names:
            conn.execute(text(f"TRUNCATE {', '.join(table_names)} CASCADE"))
        conn.execute(text("UPDATE sys_config SET last_number = 0"))
        conn.commit()
    print("All tables cleared.")

    db = SessionLocal()

    # ── Seed products ─────────────────────────────────────────────────────────
    print("\n--- Seeding products ---")
    prod_count = 0
    for p in products:
        code = (p.get("code") or "").strip()
        name = (p.get("name") or "").strip()
        uom = (p.get("uom") or "Cái").strip()
        if not code or not name:
            continue
        tax_rate = None
        if p.get("tax_rate") not in (None, ""):
            tax_rate = _parse_decimal(p.get("tax_rate"))
        db.add(Product(
            code=code,
            display_name=name,
            uom=uom,
            price=_parse_decimal(p.get("price")),
            tax_rate=tax_rate,
            property=(p.get("property") or "").strip() or None,
            product_type=(p.get("type") or "").strip() or None,
            is_active=True,
        ))
        prod_count += 1
    db.commit()
    print(f"  {prod_count} products created")

    # ── Seed customers ────────────────────────────────────────────────────────
    print("\n--- Seeding customers ---")
    partner_count = 0
    addr_count = 0
    seen_tax = set()

    for c in customers:
        code = (c.get("code") or "").strip()
        name = (c.get("name") or "").strip()
        tax = (c.get("tax_code") or "").strip()
        if tax in ("0", ""):
            tax = None
        if not code or not name:
            continue

        partner = Partner(
            code=code,
            legal_name=name,
            display_name=c.get("type") or name,
            partner_type="customer",
            tax_code=tax,
            phone=(c.get("phone") or "").strip() or None,
            email=(c.get("email") or "").strip() or None,
            field=(c.get("field") or "").strip() or None,
            owner=(c.get("owner") or "").strip() or None,
            description=(c.get("description") or "").strip() or None,
            address=c.get("invoice_address") or None,
        )
        db.add(partner)
        db.flush()
        partner_count += 1

        if tax and tax not in seen_tax:
            db.add(MSTMapping(tax_code=tax, partner_id=partner.id))
            seen_tax.add(tax)

        # Invoice address
        invoice_addr = (c.get("invoice_address") or "").strip()
        if invoice_addr and invoice_addr not in ("0",):
            addr_code = f"ADDR{addr_count + 1:05d}"
            city = (c.get("invoice_city") or "").strip()
            district = (c.get("invoice_district") or "").strip()
            ward = (c.get("invoice_ward") or "").strip()
            full = invoice_addr
            if ward and ward not in full:
                full = f"{full}, {ward}"
            if district and district not in full:
                full = f"{full}, {district}"
            if city and city not in full:
                full = f"{full}, {city}"

            db.add(PartnerAddress(
                code=addr_code,
                partner_id=partner.id,
                display_name=f"HĐ - {name[:50]}",
                address_type="billing",
                full_address=full,
                mapping_key=city or None,
            ))
            addr_count += 1

        # Delivery address
        delivery_addr = (c.get("delivery_address") or "").strip()
        if delivery_addr and delivery_addr != invoice_addr and delivery_addr not in ("0",):
            addr_code = f"ADDR{addr_count + 1:05d}"
            db.add(PartnerAddress(
                code=addr_code,
                partner_id=partner.id,
                display_name=f"GH - {name[:50]}",
                address_type="branch",
                full_address=delivery_addr,
            ))
            addr_count += 1

    db.commit()
    db.close()
    print(f"  {partner_count} customers created")
    print(f"  {addr_count} addresses created")
    print(f"\n✓ Done! {prod_count} products + {partner_count} customers seeded.")


main()
