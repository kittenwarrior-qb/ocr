# MISA API

OCR đơn hàng từ PDF, map sản phẩm/khách hàng, xuất Excel, đẩy lên MISA CRM.

---

## Cấu hình

```bash
cp .env.example .env
nano .env
```

Các biến bắt buộc:

```env
APP_ID=SATORICRMM
MISA_CLIENT_SECRET="..."
OPENROUTER_API_KEY=sk-or-...
```

---

## Chạy lần đầu

```bash
docker-compose up -d
chmod +x sync.sh
sleep 10 && ./sync.sh all
```

---

## Sync dữ liệu từ MISA

```bash
./sync.sh all          # tất cả
./sync.sh customers    # chỉ khách hàng
./sync.sh products     # chỉ hàng hóa
./sync.sh contacts     # chỉ liên hệ
```

Sync là upsert — chạy bao nhiêu lần cũng an toàn, tự tạo mới / cập nhật.

---

## Reset DB và sync lại

```bash
docker-compose down -v && docker-compose up -d && sleep 10 && ./sync.sh all
```

---

## Đổi MISA account (APP_ID mới)

```bash
nano .env   # sửa APP_ID + MISA_CLIENT_SECRET
docker-compose down -v && docker-compose up -d && sleep 10 && ./sync.sh all
```

---

## Cập nhật code

```bash
git pull
docker-compose up -d --build backend frontend
```

---

## Dữ liệu tĩnh (quản lý thủ công)

Hai file trong `data/` không có API MISA nên quản lý thủ công:

| File | Nội dung |
|---|---|
| `data/pricebooks.json` | Bảng giá / chiết khấu theo khách hàng |
| `data/vouchers.json` | Chương trình khuyến mãi tặng hàng |

---

## Logs & debug

```bash
docker-compose logs -f backend
docker-compose logs -f --tail=50

# Kiểm tra kết nối MISA
curl http://localhost/api/v1/misa/account/token
```
