"""
Seed customers.json and products.json into the database.
Run once: docker compose exec backend python seed_catalog.py

- Customers → partners table (partner_type=customer) + partner_addresses
- Products  → products table
Skips records that already exist (by code or tax_code).
"""
import json
import sys
from pathlib import Path

# ── Load JSON files ───────────────────────────────────────────────────────────
BASE = Path(__file__).parent

customers_path = BASE / "frontend-v2/src/data/customers.json"
products_path  = BASE / "frontend-v2/src/data/products.json"

if not customers_path.exists():
    print(f"ERROR: {customers_path} not found")
    sys.exit(1)
if not products_path.exists():
    print(f"ERROR: {products_path} not found")
    sys.exit(1)

customers = json.loads(customers_path.read_text(encoding="utf-8"))
products  = json.loads(products_path.read_text(encoding="utf-8"))

print(f"Loaded {len(customers)} customers, {len(products)} products")

# ── DB session ────────────────────────────────────────────────────────────────
from app.database import SessionLocal
from app.models.partner import Partner, PartnerAddress
from app.models.product import Product
from app.models.mapping import MSTMapping

db = SessionLocal()

# ── Seed customers ────────────────────────────────────────────────────────────
partner_created = 0
partner_skipped = 0
addr_created = 0

for c in customers:
    code = (c.get("code") or "").strip()
    name = (c.get("name") or "").strip()
    tax  = (c.get("tax_code") or "").strip()
    if tax in ("0", ""):
        tax = None

    if not code or not name:
        partner_skipped += 1
        continue

    # Skip if partner with this code already exists
    existing = db.query(Partner).filter(Partner.code == code).first()
    if existing:
        partner_skipped += 1
        # Still try to add address if missing
        partner = existing
    else:
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

        # MST mapping
        if tax:
            exists_mst = db.query(MSTMapping).filter(MSTMapping.tax_code == tax).first()
            if not exists_mst:
                db.add(MSTMapping(tax_code=tax, partner_id=partner.id))
                db.flush()

        partner_created += 1

    # Add invoice address
    invoice_addr = (c.get("invoice_address") or "").strip()
    if invoice_addr and invoice_addr not in ("0", "NHẬN HÀNG TẠI KHO LONG HẬU"):
        existing_addr = db.query(PartnerAddress).filter(
            PartnerAddress.partner_id == partner.id,
            PartnerAddress.address_type == "billing",
        ).first()
        if not existing_addr:
            # Generate a unique address code
            count = db.query(PartnerAddress).count()
            addr_code = f"ADDR{count + 1:05d}"
            while db.query(PartnerAddress).filter(PartnerAddress.code == addr_code).first():
                count += 1
                addr_code = f"ADDR{count:05d}"

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
                display_name=f"Địa chỉ hóa đơn - {name[:50]}",
                address_type="billing",
                full_address=full,
                mapping_key=city or None,
            ))
            db.flush()
            addr_created += 1

    # Add delivery address if different
    delivery_addr = (c.get("delivery_address") or "").strip()
    if delivery_addr and delivery_addr != invoice_addr and delivery_addr not in ("0",):
        existing_del = db.query(PartnerAddress).filter(
            PartnerAddress.partner_id == partner.id,
            PartnerAddress.address_type == "branch",
        ).first()
        if not existing_del:
            count = db.query(PartnerAddress).count()
            addr_code = f"ADDR{count + 1:05d}"
            while db.query(PartnerAddress).filter(PartnerAddress.code == addr_code).first():
                count += 1
                addr_code = f"ADDR{count:05d}"

            db.add(PartnerAddress(
                code=addr_code,
                partner_id=partner.id,
                display_name=f"Địa chỉ giao hàng - {name[:50]}",
                address_type="branch",
                full_address=delivery_addr,
            ))
            db.flush()
            addr_created += 1

db.commit()
print(f"Partners: {partner_created} created, {partner_skipped} skipped")
print(f"Addresses: {addr_created} created")

# ── Seed products ─────────────────────────────────────────────────────────────
prod_created = 0
prod_skipped = 0

for p in products:
    code = (p.get("code") or "").strip()
    name = (p.get("name") or "").strip()
    uom  = (p.get("uom") or "Cái").strip()

    if not code or not name:
        prod_skipped += 1
        continue

    existing = db.query(Product).filter(Product.code == code).first()
    if existing:
        prod_skipped += 1
        continue

    db.add(Product(
        code=code,
        display_name=name,
        uom=uom,
        is_active=True,
    ))
    prod_created += 1

db.commit()
print(f"Products: {prod_created} created, {prod_skipped} skipped")
print("Done.")
