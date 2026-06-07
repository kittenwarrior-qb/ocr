# MISA API

OCR đơn hàng từ PDF/Excel, map sản phẩm/khách hàng, xuất Excel và đẩy lên MISA CRM.

## Cấu Hình

```bash
cp .env.example .env
nano .env
```

MISA App ID và Secret ưu tiên nhập trong tab Cài đặt của app. Biến `.env` chỉ là fallback/bootstrap khi DB chưa có cấu hình.

## Docker Compose

Repo chỉ dùng 2 file compose:

- `docker-compose.yml`: bản VPS, không chạy Caddy riêng. Frontend/backend join vào network Caddy ngoài qua `CADDY_NETWORK`.
- `docker-compose-dev.yml`: bản dev/test độc lập, có Caddy riêng.

Chạy trên VPS:

```bash
docker compose up -d --build
```

Chạy bản dev có Caddy riêng:

```bash
docker compose -f docker-compose-dev.yml up -d --build
```

Nếu VPS dùng Caddy chung của project khác, Caddyfile bên ngoài nên trỏ tới:

```caddy
ocr2.quocbui.dev {
    handle /api/* {
        reverse_proxy misa2-backend-1:8000
    }

    handle /* {
        reverse_proxy misa2-frontend-1:80
    }
}
```

## Sync Dữ Liệu MISA

```bash
chmod +x sync.sh
./sync.sh all
./sync.sh customers
./sync.sh products
./sync.sh contacts
```

## Cập Nhật Code

```bash
git pull
docker compose up -d --build
```

## Logs

```bash
docker compose logs -f backend
docker compose logs -f --tail=80
```
