from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.config import settings

# statement_timeout chặn truy vấn/khóa DB bị treo vô thời hạn — nếu không, một
# worker OCR có thể kẹt mãi ở trạng thái "processing" khi commit phải chờ lock
# (Postgres tự hủy câu lệnh sau ngưỡng này, raise lỗi để pipeline bắt và đánh
# dấu "failed" thay vì treo im lặng).
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    connect_args={"options": "-c statement_timeout=120000"},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
