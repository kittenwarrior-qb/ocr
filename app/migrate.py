"""
Database migration — chỉ tạo bảng mới và thêm cột còn thiếu.
KHÔNG xóa data, KHÔNG reset.

Dùng sau mỗi lần deploy:
  docker compose -f docker-compose.prod.yml exec backend python -m app.migrate

seed.py vẫn giữ để dev local (reset + seed data mẫu).
"""
import sys
from sqlalchemy import text


def main():
    from app.database import SessionLocal, engine
    from app.models import Base  # import all models to register them

    print("=== Migration (no data reset) ===")

    # 1. Create all tables that don't exist yet
    Base.metadata.create_all(bind=engine)
    print("✓ Tables created / verified")

    # 2. ADD COLUMN migrations (idempotent — IF NOT EXISTS)
    migrations = [
        # processed_orders
        "ALTER TABLE processed_orders ADD COLUMN IF NOT EXISTS extra_data JSONB DEFAULT '{}'::jsonb",
        "ALTER TABLE processed_orders ADD COLUMN IF NOT EXISTS order_number VARCHAR(100)",
        "ALTER TABLE processed_orders ADD COLUMN IF NOT EXISTS po_number VARCHAR(100)",
        "ALTER TABLE processed_orders ADD COLUMN IF NOT EXISTS delivery_date DATE",
        "ALTER TABLE processed_orders ADD COLUMN IF NOT EXISTS currency VARCHAR(10)",
        "ALTER TABLE processed_orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(200)",
        "ALTER TABLE processed_orders ADD COLUMN IF NOT EXISTS recipient_name VARCHAR(200)",
        "ALTER TABLE processed_orders ADD COLUMN IF NOT EXISTS description TEXT",
        "ALTER TABLE processed_orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(18,2)",
        "ALTER TABLE processed_orders ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(18,2)",
        "ALTER TABLE processed_orders ADD COLUMN IF NOT EXISTS missing_fields JSONB DEFAULT '[]'",
        # order_lines
        "ALTER TABLE order_lines ADD COLUMN IF NOT EXISTS discount_rate NUMERIC(5,2)",
        "ALTER TABLE order_lines ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(18,2)",
        "ALTER TABLE order_lines ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2)",
        "ALTER TABLE order_lines ADD COLUMN IF NOT EXISTS ocr_product_code VARCHAR(200)",
        # products
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS price NUMERIC(18,2) NOT NULL DEFAULT 0",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2)",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS property VARCHAR(100)",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type VARCHAR(100)",
        # raw_documents
        "ALTER TABLE raw_documents ADD COLUMN IF NOT EXISTS session_id UUID",
        # partners
        "ALTER TABLE partners ADD COLUMN IF NOT EXISTS phone VARCHAR(50)",
        "ALTER TABLE partners ADD COLUMN IF NOT EXISTS email VARCHAR(300)",
        "ALTER TABLE partners ADD COLUMN IF NOT EXISTS field VARCHAR(200)",
        "ALTER TABLE partners ADD COLUMN IF NOT EXISTS owner VARCHAR(200)",
        "ALTER TABLE partners ADD COLUMN IF NOT EXISTS description TEXT",
    ]

    with engine.connect() as conn:
        ok = 0
        for sql in migrations:
            try:
                conn.execute(text(sql))
                ok += 1
            except Exception as e:
                print(f"  skip: {sql[:60]}... ({e})")
        conn.commit()
    print(f"✓ {ok}/{len(migrations)} column migrations applied")

    # 3. Ensure sys_config defaults
    try:
        from app.services.code_generator import init_default_configs
        db = SessionLocal()
        init_default_configs(db)
        db.close()
        print("✓ sys_config defaults OK")
    except Exception as e:
        print(f"  sys_config: {e}")

    print("\n✓ Migration complete — data untouched")


main()
