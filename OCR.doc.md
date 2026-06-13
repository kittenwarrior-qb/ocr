# OCR System — Tài liệu kiến trúc & cách áp dụng

> Mục đích file này: mô tả đầy đủ hệ thống OCR/extract hiện có trong repo này để
> một người (hoặc một đoạn chat khác) có thể **hiểu cấu trúc, cách extract, và
> cách tái sử dụng** khi viết một **module OCR cho Odoo** — nơi mỗi lần đính kèm
> file (PDF/Excel) sẽ tự gọi OCR và đổ dữ liệu vào form.

---

## 1. Tổng quan luồng (end-to-end)

```
Upload file (PDF/Excel/ảnh)
   │
   ▼
[1] RawDocument (lưu file + metadata)        ── app/services/document_service.py
   │
   ▼
[2] Enqueue → worker thread xử lý nền        ── app/services/ocr_queue.py
   │
   ▼
[3] EXTRACT (2 pass với AI, hoặc rule/Excel) ── app/services/ocr_service.py
   │        Pass 1: MST + loại chứng từ + format_hint
   │        Pass 2: full fields + items (theo template prompt nếu có)
   ▼
[4] NORMALIZE số tiền kiểu VN ("1.076.328"→1076328)
   │
   ▼
[5] MAPPING với dữ liệu có sẵn               ── app/services/mapping_service.py
   │        - partner (KH/NCC) theo MST (chính xác) hoặc tên (fuzzy)
   │        - contact (liên hệ) theo tên cty/địa chỉ/người nhận (fuzzy)
   │        - mỗi dòng hàng → temp_code → product_id (fuzzy ≥82đ)
   ▼
[6] Lưu ProcessedOrder/ProcessedBill + OrderLine/BillLine + extra_data(JSONB)
   │
   ▼
[7] REVIEW trên UI (người dùng sửa/map lại)  ── frontend OrderDetailForm
   │
   ▼
[8] EXPORT: Excel mẫu MISA / payload "Đơn mua hàng" (ĐMH) / push API
```

Điểm mấu chốt cho Odoo: **bước [3]→[6]** là "lõi OCR". Một module Odoo chỉ cần
gọi lõi này (qua HTTP API sẵn có, hoặc port logic sang Python của Odoo) rồi map
kết quả vào field của form (vd `purchase.order`).

---

## 2. Các loại file & cách extract tương ứng

Quyết định ở `document_service.process_raw_document()`:

| Loại input | Đường đi | Hàm chính |
|------------|----------|-----------|
| **Excel mẫu Satori** | parse trực tiếp (không AI) | `excel_order_parser.parse_excel_order` |
| **Excel khác** | đổi thành bảng text → gửi AI | `ocr_service.extract_from_excel_text` |
| **PDF / ảnh (có AI)** | 2 pass gọi vision LLM | `ocr_service.extract_mst_and_type` → `extract_full_document` |
| **PDF (không AI)** | pdfplumber + regex | `extract_by_pattern_rules` (pattern_extraction.py) |

PDF → ảnh: `pdf2image.convert_from_path(dpi=200)`, mỗi trang 1 ảnh, resize
max 2048px, nén JPEG cho tới khi < 2.5MB, encode base64 — xem
`ocr_service._file_to_base64_images`. **Hỗ trợ multi-page**: gửi tất cả ảnh trang
trong 1 request, prompt yêu cầu gộp items từ mọi trang.

---

## 3. Lõi extract bằng AI (quan trọng nhất)

File: `app/services/ocr_service.py`

### 3.1. Provider
- OpenRouter (mặc định, model `google/gemini-2.5-flash`) hoặc NVIDIA NIM.
- Chọn provider: `_resolve_provider()` đọc `settings.OCR_PROVIDER` (`openrouter`/
  `nvidia`/`auto`).
- API key + model lấy từ **DB (`sys_config`) trước, fallback `.env`** —
  `_get_ocr_credentials()`. Gọi qua OpenAI-compatible `/chat/completions`,
  `temperature=0.1`, `max_tokens=4096`.

### 3.2. Hai pass
1. **Pass 1 — `extract_mst_and_type`** (prompt `GENERIC_MST_PROMPT`): chỉ lấy
   `tax_code` (MST người bán), `document_type` (`purchase_order|vendor_bill`),
   `order_number`, `format_hint` (`osifood|seven_eleven|coopfood|standard`).
   → Nhanh/rẻ, để **chọn template** phù hợp (`template_service.find_template`).
2. **Pass 2 — `extract_full_document`** (prompt `GENERIC_FULL_PROMPT`, hoặc prompt
   riêng của template nếu match): lấy toàn bộ header + `items[]`.

### 3.3. Prompt extract (bài học đã đúc kết — port nguyên si khi làm Odoo)
Prompt `GENERIC_FULL_PROMPT` chứa nhiều rule nghiệp vụ quan trọng:
- **REQUIRED**: `order_date`, `delivery_date`, `total_amount`,
  và mỗi item: `quantity`, `unit`, `line_total`.
- **Số kiểu VN**: dấu `.` = phân cách nghìn, `,` = thập phân.
  `"1.076.328" → 1076328`. Tiền VND luôn là số nguyên.
- **Đọc nguyên văn, KHÔNG tự tính**: không tự cộng items ra total; nếu document
  không in total thì để `null` (total suy ra có thể sai do thiếu trang/thuế).
- **Phân biệt đơn vị**: khi có nhiều cột SL (Thùng vs Pcs), lấy SL khớp với cột
  ĐVT — tránh nhầm Pcs/Box.
- **Quy tắc danh tính bên mua/bên bán**:
  - `customer_name` = tổ chức/công ty MUA hàng (không bao giờ là tên người).
  - `vendor_name` = bên bán/cung cấp.
  - **SATORI luôn là vendor/seller, KHÔNG bao giờ là customer** (rule cứng trong
    repo này; khi làm cho công ty khác cần đổi tên này).
- **FIELD ALIASES**: prompt liệt kê hàng chục nhãn tiếng Việt/Anh cho cùng 1
  field (vd `order_number` ↔ "Số PO"/"PO No."/"Số chứng từ"…). Đây là phần giá
  trị nhất — giữ lại khi port.

### 3.4. Output JSON (schema extract)
```json
{
  "document_type": "purchase_order | vendor_bill",
  "order_number": "string|null",
  "order_date": "YYYY-MM-DD",
  "delivery_date": "YYYY-MM-DD",
  "currency": "VND|USD|null",
  "payment_method": "string|null",
  "recipient_name": "string|null",
  "customer_name": "string|null",
  "customer_tax_code": "string|null",
  "vendor_name": "string|null",
  "vendor_tax_code": "string|null",
  "company_address": "string|null",
  "delivery_address": "string|null",
  "total_amount": number,
  "discount_amount": number|null,
  "tax_amount": number|null,
  "items": [
    {
      "product_code": "string|null",
      "product_name": "string",
      "quantity": number,
      "unit": "string",
      "unit_price": number|null,
      "discount_rate": number|null,
      "discount_amount": number|null,
      "tax_rate": number|null,
      "line_total": number
    }
  ]
}
```

### 3.5. Hậu xử lý số
`_normalize_extracted_amounts` → `_normalize_vn_number`: sửa lỗi parse số kiểu VN
cho `total_amount/discount_amount/tax_amount` và từng item. Heuristic: phần thập
phân đúng 3 chữ số thường là dấu phân cách nghìn bị hiểu nhầm.

---

## 4. Mapping với dữ liệu có sẵn

File: `app/services/mapping_service.py`. Fuzzy dùng `thefuzz` (`app/utils/fuzzy_match.py`).

### 4.1. Partner (Khách hàng / Nhà cung cấp)
- `find_existing_partner(db, name, tax_code, type)` →
  trả `(partner, match_type)`:
  - **MST khớp chính xác → `match_type="tax_code"`** (đáng tin).
  - **Chỉ khớp tên (fuzzy ≥70) → `match_type="fuzzy"`** (máy đoán — UI phải báo
    rõ để người dùng kiểm tra lại). Không tìm thấy → `""`.
- PO: partner = bên MUA (customer). Bill: partner = bên BÁN (vendor).

### 4.2. Contact (Liên hệ)
`find_best_contact(...)` ghép theo điểm fuzzy của tên công ty / địa chỉ / người
nhận → luôn `match_type="fuzzy"` khi có. `find_customer_for_contact` suy ngược ra
partner từ `contact.organization`.

### 4.3. Dòng hàng → sản phẩm
`resolve_temp_code(db, product_code, product_name, tax_rate)`:
- `temp_code` = `product_code` nếu có, ngược lại sinh từ tên.
- Nếu `temp_code` đã từng map → tái dùng `product_id` (học dần qua thời gian).
- Nếu mới → auto-match theo tên trong catalog (`_product_match_score` có cộng/trừ
  điểm theo thuế suất), **chỉ nhận khi điểm ≥ 82**; nếu không → `status="pending"`
  (chờ người dùng map tay).

> Cơ chế **temp_code học một lần dùng mãi** là điểm đáng port sang Odoo: lần đầu
> kế toán map "Mã NCC X → product.product Y", các đơn sau tự map.

---

## 5. Mô hình dữ liệu (DB)

File: `app/models/document.py`. Hai nhánh song song:

| Purchase Order | Vendor Bill (hóa đơn GTGT) | Ghi chú |
|----------------|----------------------------|---------|
| `RawDocument` | `RawDocument` | file gốc + `extracted_data` (JSONB) + `ocr_status` |
| `ProcessedOrder` | `ProcessedBill` | header đã chuẩn hóa |
| `OrderLine` | `BillLine` | dòng hàng, có `temp_code`, `product_id`, `mapping_status` |

`ProcessedOrder/Bill` có cột `extra_data` (JSONB) chứa toàn bộ thông tin KH/LH/địa
chỉ đã resolve — shape đầy đủ ở `document_service._build_order_extra_data` (các key
chính: `customer_code/customer_name/customer_tax_code/invoice_address/
delivery_address/contact*/order_type/customer_match_type/contact_match_type/...`).

`mapping_status` mỗi dòng: `pending` (chưa map) | `mapped` (auto) | `overridden`
(người dùng sửa tay).

---

## 6. Xử lý nền (queue)

File: `app/services/ocr_queue.py`. Khi upload, `documents.upload_batch` gọi
`enqueue(raw_id, use_ai)`; N worker thread (`OCR_CONCURRENCY`, mặc định 3) gọi
`document_service.process_raw_document`. UI poll `GET /sessions/{id}/details` cho
tới khi `processing_count == 0`.

> Với Odoo nên thay queue thread bằng **job queue của Odoo** (`queue_job` của OCA)
> hoặc cron, vì Odoo worker model khác.

---

## 7. API có sẵn (dùng trực tiếp cho Odoo qua HTTP)

Base: `/api/v1`. Các endpoint liên quan extract/mapping:

| Method & path | Việc |
|---------------|------|
| `POST /documents/upload-batch` | upload nhiều file → tạo RawDocument + enqueue OCR |
| `GET  /documents/orders/{id}` | lấy 1 đơn đã xử lý (header + lines + extra_data) |
| `PATCH /documents/orders/{id}` | lưu chỉnh sửa sau review |
| `GET  /sessions/{id}/details` | trạng thái OCR + danh sách đơn của phiên |
| `POST /documents/orders/manual` | tạo đơn trống nhập tay |
| `GET  /misa/purchase-order/{id}/payload` | dựng payload "Đơn mua hàng" (ĐMH) |
| `GET  /misa/invoice-docs/{session_id}` | gộp order + bill của 1 phiên |

> **Cách tích hợp Odoo đơn giản nhất**: module Odoo gọi `upload-batch`, poll
> `sessions/{id}/details`, rồi map JSON trả về vào field form. Không cần port lõi.

---

## 8. Hướng dẫn dựng module OCR cho Odoo

Hai phương án:

### Phương án A — Gọi service này như microservice (khuyến nghị)
1. Trong Odoo, tạo model wrapper (vd kế thừa `purchase.order` hoặc model riêng).
2. Khi `ir.attachment` được thêm (hoặc nút "OCR"), gọi `POST /documents/upload-batch`.
3. Poll `GET /sessions/{id}/details` bằng `queue_job`/cron đến khi xong.
4. Map JSON → field Odoo (xem bảng map ở §9).
5. Hiển thị cho user review; map dòng hàng pending → `product.product`.

→ Tái dùng 100% lõi extract + mapping + cơ chế học temp_code đã chạy ổn định.

### Phương án B — Port lõi sang module Odoo thuần
Port các file: `ocr_service.py` (prompt + gọi LLM + normalize), phần fuzzy mapping,
và schema JSON. Nặng hơn nhưng không phụ thuộc service ngoài. Giữ nguyên:
- toàn bộ **prompt** (`GENERIC_MST_PROMPT`, `GENERIC_FULL_PROMPT` — đặc biệt phần
  FIELD ALIASES và rule số VN),
- `_normalize_vn_number`,
- ngưỡng fuzzy (partner 70, product 82, address 80).

---

## 9. Bảng map đề xuất: JSON extract → field Odoo `purchase.order`

| JSON extract | Odoo `purchase.order` | Ghi chú |
|--------------|------------------------|---------|
| `vendor_name`/`customer_name`(*) | `partner_id` | resolve qua `res.partner` theo MST trước, tên sau |
| `vendor_tax_code`/`customer_tax_code` | `partner_id.vat` | khớp chính xác = tin cậy |
| `order_date` | `date_order` | |
| `delivery_date` | `date_planned` (trên line) | |
| `order_number` | `partner_ref` / `origin` | số chứng từ gốc |
| `total_amount` | đối chiếu `amount_total` | KHÔNG ghi đè — dùng để cảnh báo lệch |
| `tax_amount` | đối chiếu `amount_tax` | dùng fallback thuế nếu line thiếu (xem dưới) |
| `items[].product_code/name` | `order_line.product_id` | resolve qua temp_code/fuzzy |
| `items[].quantity` | `order_line.product_qty` | |
| `items[].unit` | `order_line.product_uom` | cần map ĐVT → `uom.uom` |
| `items[].unit_price` | `order_line.price_unit` | |
| `items[].tax_rate` | `order_line.taxes_id` | "8%" → thuế tương ứng |
| `items[].line_total` | đối chiếu `price_subtotal` | |

(*) Tùy `document_type`: PO lấy bên mua, hóa đơn mua vào lấy bên bán.

> **Fallback thuế** (bài học thực tế): OCR đôi khi bỏ sót `tax_rate` ở dòng dù
> header có `tax_amount`. Khi đó suy ra % hiệu dụng = `tax_amount / Σ(line_total)`
> rồi áp cho dòng thiếu (đã làm trong `po_payload_builder.build_purchase_order_payload`).

---

## 10. Cấu hình (env / sys_config)

| Key | Ý nghĩa |
|-----|---------|
| `OCR_PROVIDER` | `openrouter` \| `nvidia` \| `auto` |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | provider mặc định (model `google/gemini-2.5-flash`) |
| `NVIDIA_API_KEY`, `NVIDIA_MODEL` | provider thay thế |
| `OCR_CONCURRENCY` | số worker OCR song song (mặc định 3) |

API key/model ưu tiên đọc từ DB `sys_config` (`openrouter_api_key`,
`openrouter_model`), fallback `.env`.

---

## 11. File tham chiếu nhanh

| Vai trò | File |
|---------|------|
| Lõi extract AI (prompt, gọi LLM, normalize) | `app/services/ocr_service.py` |
| Điều phối: file→extract→mapping→DB | `app/services/document_service.py` |
| Mapping partner/contact/product (fuzzy + học temp_code) | `app/services/mapping_service.py` |
| Queue worker | `app/services/ocr_queue.py` |
| Parse Excel mẫu Satori | `app/services/excel_order_parser.py` |
| Rule-based PDF (không AI) | `app/services/pattern_extraction.py`, `app/services/ocr/po_rules.py` |
| Chọn template theo MST/format | `app/services/template_service.py` |
| Model DB | `app/models/document.py`, `app/models/partner.py`, `app/models/product.py` |
| Dựng payload "Đơn mua hàng" | `app/services/po_payload_builder.py` |
| Endpoint upload/orders | `app/api/documents.py`, `app/api/sessions.py`, `app/api/misa.py` |
```
