from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.router import api_router
from app.database import engine
from app.models import Base
from app.services.code_generator import init_default_configs
from app.services.template_service import seed_builtin_templates
from app.services.ocr_queue import start as start_ocr_queue
from app.database import SessionLocal

_MIGRATIONS = [
    "ALTER TABLE processed_orders ADD COLUMN IF NOT EXISTS currency VARCHAR(10)",
    "ALTER TABLE processed_orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(200)",
    "ALTER TABLE processed_orders ADD COLUMN IF NOT EXISTS recipient_name VARCHAR(200)",
    "ALTER TABLE processed_orders ADD COLUMN IF NOT EXISTS description TEXT",
    "ALTER TABLE processed_orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(18,2)",
    "ALTER TABLE processed_orders ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(18,2)",
    "ALTER TABLE processed_orders ADD COLUMN IF NOT EXISTS missing_fields JSONB DEFAULT '[]'",
    "ALTER TABLE processed_bills ADD COLUMN IF NOT EXISTS currency VARCHAR(10)",
    "ALTER TABLE processed_bills ADD COLUMN IF NOT EXISTS payment_method VARCHAR(200)",
    "ALTER TABLE processed_bills ADD COLUMN IF NOT EXISTS recipient_name VARCHAR(200)",
    "ALTER TABLE processed_bills ADD COLUMN IF NOT EXISTS description TEXT",
    "ALTER TABLE processed_bills ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(18,2)",
    "ALTER TABLE processed_bills ADD COLUMN IF NOT EXISTS missing_fields JSONB DEFAULT '[]'",
    "ALTER TABLE order_lines ADD COLUMN IF NOT EXISTS discount_rate NUMERIC(5,2)",
    "ALTER TABLE order_lines ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(18,2)",
    "ALTER TABLE order_lines ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2)",
    "ALTER TABLE bill_lines ADD COLUMN IF NOT EXISTS discount_rate NUMERIC(5,2)",
    "ALTER TABLE bill_lines ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(18,2)",
    "ALTER TABLE templates ADD COLUMN IF NOT EXISTS field_aliases JSONB",
    """CREATE TABLE IF NOT EXISTS ocr_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(200) NOT NULL,
        note TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        closed_at TIMESTAMP
    )""",
    "ALTER TABLE raw_documents ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES ocr_sessions(id)",
    "ALTER TABLE order_lines ADD COLUMN IF NOT EXISTS ocr_product_code VARCHAR(200)",
    "ALTER TABLE bill_lines ADD COLUMN IF NOT EXISTS ocr_product_code VARCHAR(200)",
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    with engine.connect() as conn:
        for sql in _MIGRATIONS:
            conn.execute(text(sql))
        conn.commit()
    db = SessionLocal()
    try:
        init_default_configs(db)
        seed_builtin_templates(db)
    finally:
        db.close()
    from app.config import settings as _settings
    start_ocr_queue(_settings.OCR_CONCURRENCY)
    yield


app = FastAPI(
    title="OCR Risk - Hệ thống xử lý chứng từ",
    description="OCR + Mapping tự động cho Đơn đặt hàng và Hóa đơn GTGT",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/health")
def health():
    return {"status": "ok"}
