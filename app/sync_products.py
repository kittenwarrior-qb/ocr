"""Sync product catalog fields from data/products.json without clearing data.

Usage:
  python -m app.sync_products

In Docker:
  docker compose exec backend python -m app.sync_products
  docker compose -f docker-compose.prod.yml exec backend python -m app.sync_products
"""
import json
from decimal import Decimal
from pathlib import Path

from sqlalchemy import text

from app.database import SessionLocal, engine
from app.models import Base
from app.models.product import Product

DATA_DIR = Path(__file__).parent.parent / "data"
PRODUCTS_PATH = DATA_DIR / "products.json"


def _parse_decimal(value, default="0") -> Decimal:
    if value is None or value == "":
        return Decimal(default)
    text = str(value).strip().replace(",", ".").replace("%", "")
    if not text:
        return Decimal(default)
    return Decimal(text)


def _parse_tax_rate(value) -> Decimal | None:
    if value in (None, ""):
        return None
    return _parse_decimal(value)


def _ensure_schema() -> None:
    Base.metadata.create_all(bind=engine)
    migrations = [
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS price NUMERIC(18,2) NOT NULL DEFAULT 0",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2)",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS property VARCHAR(100)",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type VARCHAR(100)",
    ]
    with engine.connect() as conn:
        for sql in migrations:
            conn.execute(text(sql))
        conn.commit()


def main() -> None:
    if not PRODUCTS_PATH.exists():
        raise FileNotFoundError(f"{PRODUCTS_PATH} not found")

    products = json.loads(PRODUCTS_PATH.read_text(encoding="utf-8"))
    _ensure_schema()

    db = SessionLocal()
    created = 0
    updated = 0
    skipped = 0
    try:
        for row in products:
            code = (row.get("code") or "").strip()
            name = (row.get("name") or "").strip()
            if not code or not name:
                skipped += 1
                continue

            product = db.query(Product).filter(Product.code == code).first()
            if not product:
                product = Product(code=code, display_name=name, uom=(row.get("uom") or "").strip(), is_active=True)
                db.add(product)
                created += 1
            else:
                updated += 1

            product.display_name = name
            product.uom = (row.get("uom") or "").strip()
            product.price = _parse_decimal(row.get("price"))
            product.tax_rate = _parse_tax_rate(row.get("tax_rate"))
            product.property = (row.get("property") or "").strip() or None
            product.product_type = (row.get("type") or "").strip() or None
            product.is_active = True

        db.commit()
    finally:
        db.close()

    print(f"Synced products: created={created}, updated={updated}, skipped={skipped}, total={len(products)}")


if __name__ == "__main__":
    main()
