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

    # Run migrations (same as main.py lifespan)
    from app.main import _MIGRATIONS
    with engine.connect() as conn:
        for sql in _MIGRATIONS:
            try:
                conn.execute(text(sql))
            except Exception:
                pass
        conn.commit()

    # Ensure sys_config defaults exist
    from app.services.code_generator import init_default_configs
    db = SessionLocal()
    init_default_configs(db)
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
        db.add(Product(code=code, display_name=name, uom=uom, is_active=True))
        prod_count += 1
    db.commit()
    print(f"  {prod_count} products created")

    # ── Seed customers ────────────────────────────────────────────────────────
    print("\n--- Seeding customers ---")
    partner_count = 0
    addr_count = 0

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
            display_name=name,
            partner_type="customer",
            tax_code=tax,
            address=c.get("invoice_address") or None,
        )
        db.add(partner)
        db.flush()
        partner_count += 1

        if tax:
            db.add(MSTMapping(tax_code=tax, partner_id=partner.id))

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


if __name__ == "__main__":
    main()
