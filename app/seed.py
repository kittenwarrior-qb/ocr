"""
Khởi tạo schema DB và seed cấu hình hệ thống.
Dữ liệu khách hàng / hàng hóa / liên hệ được đồng bộ từ MISA qua API:
  POST /api/v1/misa/sync/customers
  POST /api/v1/misa/sync/products
  POST /api/v1/misa/sync/contacts

Usage:
  python -m app.seed
  docker compose exec backend python -m app.seed
"""


def main():
    from sqlalchemy import text
    from app.database import SessionLocal, engine
    from app.models import Base
    from app.services.code_generator import init_default_configs

    print("Creating tables...")
    Base.metadata.create_all(bind=engine)

    print("Seeding sys_config defaults...")
    db = SessionLocal()
    try:
        init_default_configs(db)
        print("  ✓ sys_config initialized")
    except Exception as e:
        print(f"  ! sys_config error: {e}")
        db.rollback()
    finally:
        db.close()

    print("\n✓ Done.")
    print("  → To load data, call:")
    print("    POST /api/v1/misa/sync/customers")
    print("    POST /api/v1/misa/sync/products")
    print("    POST /api/v1/misa/sync/contacts")


main()
