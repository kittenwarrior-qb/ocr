# OCR Order Processing System

Hệ thống OCR xử lý đơn đặt hàng PDF, tự động nhận diện sản phẩm và khách hàng, xuất Excel theo format MISA.

## Tổng quan

- **Backend**: FastAPI + PostgreSQL + OpenRouter (Gemini Flash) cho OCR
- **Frontend**: React + Vite + Ant Design (deploy trên Vercel)
- **Reverse Proxy**: Caddy (auto HTTPS)

### Luồng hoạt động

1. Upload file PDF đơn hàng
2. OCR tự động trích xuất thông tin (sản phẩm, số lượng, đơn giá, khách hàng...)
3. Hệ thống gợi ý mapping sản phẩm + khách hàng từ catalog
4. User xác nhận/sửa mapping
5. Xuất Excel theo format MISA import (2 sheet: Đơn hàng + Hàng hóa)

## Cấu trúc

```
app/                    # Backend FastAPI
├── api/                # API routes
├── models/             # SQLAlchemy models
├── services/           # Business logic (OCR, export, mapping...)
└── utils/              # Helpers
frontend-v2/           # Frontend React
├── src/data/           # JSON catalog (products.json, customers.json)
├── src/pages/          # Pages (Orders, Products, Customers)
└── src/components/     # Shared components
```

## Chạy dự án (Development)

### Yêu cầu
- Docker + Docker Compose
- Node.js 18+ (cho frontend dev)

### 1. Clone và cấu hình

```bash
git clone https://github.com/kittenwarrior-qb/ocr.git
cd ocr
cp .env.example .env
# Sửa .env: thêm OPENROUTER_API_KEY
```

### 2. Chạy backend + DB

```bash
docker compose up -d
```

Backend chạy tại `http://localhost:8000`

### 3. Seed dữ liệu (288 sản phẩm + ~2000 khách hàng)

```bash
docker compose exec backend python seed_catalog.py
```

### 4. Chạy frontend (dev mode)

```bash
cd frontend-v2
npm install
npm run dev
```

Frontend chạy tại `http://localhost:3001`

## Chạy dự án (Production - VPS)

### 1. Clone và cấu hình

```bash
git clone https://github.com/kittenwarrior-qb/ocr.git /app/ocr
cd /app/ocr
cp .env.example .env
nano .env  # Thêm OPENROUTER_API_KEY
```

### 2. Deploy

```bash
docker compose -f docker-compose.prod.yml up -d
```

### 3. Seed dữ liệu

```bash
docker compose -f docker-compose.prod.yml exec backend python seed_catalog.py
```

### 4. Cập nhật code

```bash
git pull origin main
docker compose -f docker-compose.prod.yml up -d --build backend
```

## Seed dữ liệu

Script `seed_catalog.py` sẽ:
- **Xóa sạch** toàn bộ dữ liệu cũ (orders, sessions, mappings, partners, products)
- Seed 288 sản phẩm từ `frontend-v2/src/data/products.json`
- Seed ~1996 khách hàng từ `frontend-v2/src/data/customers.json`
- Reset counter số đơn hàng về 0

Chạy lại bất cứ lúc nào để reset DB về trạng thái sạch.

## Biến môi trường (.env)

| Biến | Mô tả | Mặc định |
|------|--------|----------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:password@db:5432/ocr_risk` |
| `OCR_PROVIDER` | Provider OCR: `openrouter` / `nvidia` | `openrouter` |
| `OPENROUTER_API_KEY` | API key OpenRouter | (bắt buộc) |
| `OPENROUTER_MODEL` | Model OCR | `google/gemini-2.5-flash` |
| `OCR_CONCURRENCY` | Số worker OCR song song | `3` |
| `UPLOAD_DIR` | Thư mục lưu file upload | `./uploads` |

## API chính

| Method | Endpoint | Mô tả |
|--------|----------|--------|
| POST | `/api/v1/documents/upload-batch` | Upload PDF đơn hàng |
| GET | `/api/v1/sessions` | Danh sách phiên |
| GET | `/api/v1/sessions/{id}/details` | Chi tiết phiên (orders + lines) |
| GET | `/api/v1/sessions/{id}/export` | Xuất Excel MISA |
| POST | `/api/v1/mappings/{temp_code}/map` | Map sản phẩm |
| PATCH | `/api/v1/documents/orders/{id}` | Cập nhật đơn hàng |
