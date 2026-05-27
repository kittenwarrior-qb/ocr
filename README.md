# OCR Risk — Hệ thống xử lý chứng từ kế toán

Tự động OCR và chuẩn hoá **Đơn đặt hàng (PO)** và **Hóa đơn GTGT** từ file PDF/ảnh, mapping sản phẩm, và xuất Excel theo phiên xử lý.

## Tech stack

| Layer | Công nghệ |
|---|---|
| Backend | FastAPI + SQLAlchemy 2.0 |
| Database | PostgreSQL 15 |
| OCR | OpenRouter (Gemini Flash) / NVIDIA NIM |
| Frontend | React 18 + Vite + Tailwind CSS v3 |
| Deploy | Docker Compose |

## Tính năng chính

- Upload hàng loạt PDF/JPG/PNG — OCR song song (cấu hình số worker)
- Nhận diện tự động: loại chứng từ, mã số thuế nhà cung cấp, mã PO
- Template OCR theo đối tác — mapping tên trường OCR sang field hệ thống
- Tự động tra MST → khớp đối tác trong danh mục
- Mapping sản phẩm: fuzzy match tên hàng OCR → mã sản phẩm nội bộ
- Phiên xử lý: gom chứng từ theo đợt, xuất Excel tổng hợp
- Giao diện sáng/tối, hỗ trợ dark mode

## Cài đặt nhanh

### Yêu cầu
- Docker & Docker Compose

### Chạy lần đầu

```bash
# 1. Copy file cấu hình
cp .env.example .env

# 2. Điền API key vào .env
#    OPENROUTER_API_KEY=sk-or-...   (hoặc NVIDIA_API_KEY)

# 3. Khởi động
docker compose up -d

# Frontend: http://localhost:3000
# Backend API: http://localhost:8000/docs
```

### Biến môi trường quan trọng

| Biến | Mô tả | Mặc định |
|---|---|---|
| `OPENROUTER_API_KEY` | API key OpenRouter | _(bắt buộc)_ |
| `OPENROUTER_MODEL` | Model OCR | `google/gemini-2.5-flash` |
| `OCR_CONCURRENCY` | Số request OCR song song | `3` |
| `DATABASE_URL` | Kết nối PostgreSQL | tự động qua docker-compose |

## Cấu trúc dự án

```
ocr-risk/
├── app/                    # FastAPI backend
│   ├── api/                # Route handlers
│   ├── models/             # SQLAlchemy models
│   ├── schemas/            # Pydantic schemas
│   ├── services/           # Business logic, OCR pipeline
│   └── main.py
├── frontend/               # React + Vite
│   └── src/
│       ├── pages/          # Dashboard, Orders, Bills, ...
│       └── components/
├── docker-compose.yml
├── Dockerfile.backend
└── requirements.txt
```

## API Docs

Sau khi chạy: [http://localhost:8000/docs](http://localhost:8000/docs)
