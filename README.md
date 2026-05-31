# OCR Order Processing System

Hệ thống OCR xử lý đơn đặt hàng PDF → tự động nhận diện sản phẩm/khách hàng → xuất Excel MISA.

### Yêu cầu
- Docker + Docker Compose
- Node.js 18+ (frontend dev)
- File data: `products.json` + `customers.json` (hỏi chủ dự án lấy)

### Bước 1: Cấu hình

```bash
git clone https://github.com/kittenwarrior-qb/ocr.git
cd ocr
cp .env.example .env
# Mở .env, điền OPENROUTER_API_KEY
```

### Bước 2: Đặt file data

Đặt 2 file JSON vào folder `data/` (nằm ở root dự án):

```
ocr/
├── data/
│   ├── products.json      ← 288 sản phẩm
│   └── customers.json     ← ~2000 khách hàng
├── app/
├── frontend-v2/
└── ...
```

### Bước 3: Chạy backend

```bash
docker compose up -d
```

Đợi ~10s cho DB healthy, rồi seed dữ liệu:

```bash
docker compose exec backend python -m app.seed
```

Backend chạy tại http://localhost:8000

### Bước 4: Chạy frontend

```bash
cd frontend-v2
npm install
npm run dev
```

Frontend chạy tại http://localhost:3001

---

## Production (VPS)

```bash
# Deploy
cd /app/ocr
cp .env.example .env && nano .env
docker compose -f docker-compose.prod.yml up -d

# Seed (đặt JSON vào data/ trước)
docker compose -f docker-compose.prod.yml exec backend python -m app.seed

# Cập nhật
git pull origin main
docker compose -f docker-compose.prod.yml up -d --build backend
```

---

## Tổng quan kiến trúc

```
app/                    # Backend (FastAPI + PostgreSQL)
├── api/                # REST endpoints
├── models/             # SQLAlchemy ORM
├── services/           # Business logic (OCR, export, mapping)
├── utils/              # Helpers
└── seed.py             # Seed script (python -m app.seed)
data/                   # JSON data (git ignored, mount vào container)
frontend-v2/           # Frontend (React + Vite + Ant Design)
```

## Luồng hoạt động

1. Upload PDF đơn hàng
2. OCR tự động trích xuất (Gemini Flash via OpenRouter)
3. Gợi ý mapping sản phẩm + khách hàng
4. User xác nhận/sửa
5. Xuất Excel format MISA (2 sheet: Đơn hàng + Hàng hóa)

## Biến môi trường (.env)

| Biến | Mô tả |
|------|--------|
| `OPENROUTER_API_KEY` | API key OpenRouter (bắt buộc) |
| `OPENROUTER_MODEL` | Model OCR (mặc định: `google/gemini-2.5-flash`) |
| `OCR_CONCURRENCY` | Số worker OCR song song (mặc định: 3) |
| `DATABASE_URL` | PostgreSQL (mặc định: `postgresql://postgres:password@db:5432/ocr_risk`) |
