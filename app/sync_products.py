"""
Đồng bộ hàng hóa từ MISA CRM về DB local.
Tương đương gọi: POST /api/v1/misa/sync/products

Usage:
  python -m app.sync_products
  docker compose exec backend python -m app.sync_products
"""
from app.database import SessionLocal
from app.services.misa_sync import sync_products

db = SessionLocal()
try:
    result = sync_products(db)
    print(
        f"✓ Done: {result['total']} total | "
        f"{result['created']} created | "
        f"{result['updated']} updated | "
        f"{result['errors']} errors"
    )
finally:
    db.close()
