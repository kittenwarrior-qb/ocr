# Tích hợp CRUD Khách hàng & Liên hệ (MISA CRM ⇄ Odoo)

> Tài liệu hướng dẫn tích hợp API CRUD **Khách hàng (Customers)** và **Liên hệ (Contacts)**
> của MISA CRM (`crmconnect.misa.vn`) vào **Odoo**. Bao gồm: endpoint, danh sách field,
> quy tắc validate đã kiểm chứng thực tế, cách xử lý **Nhân viên bán hàng (`custom_field4`)**,
> và hướng dẫn cho **AI (Claude) tự triển khai module trên Odoo**.
>
> Mọi quy tắc trong tài liệu này đã được kiểm chứng bằng cách gọi API thật trên tenant
> `MONGTHUY` (tháng 6/2026), không phải suy đoán từ tài liệu.

---

## 1. Kiến trúc & điểm vào API

Có **hai tầng** có thể gọi:

| Tầng | Base URL | Khi nào dùng |
|------|----------|--------------|
| **MISA trực tiếp** | `https://crmconnect.misa.vn/api/v2` | Odoo gọi thẳng MISA (khuyến nghị cho connector Odoo) |
| **Backend nội bộ (wrapper)** | `http://<backend>/api/v1/misa` | Đã có sẵn trong dự án này; tự refresh token, cache, sync |

Wrapper nội bộ chỉ là proxy mỏng: nó **giữ nguyên field name** của MISA và tự gắn token.

---

## 2. Xác thực (Authentication)

```http
POST https://crmconnect.misa.vn/api/v2/Account
Content-Type: application/json

{ "client_id": "<APP_ID>", "client_secret": "<CLIENT_SECRET>" }
```

Phản hồi:
```json
{ "success": true, "data": "<JWT_TOKEN>" }
```

Mọi request sau đó gắn **2 header**:
```
Authorization: Bearer <JWT_TOKEN>
Clientid: <APP_ID>
```

- Token là JWT có `exp`; nên decode `exp` để refresh trước khi hết hạn (~60s buffer).
- `APP_ID` / `CLIENT_SECRET` lấy ở: MISA CRM → Thiết lập → Nhà phát triển → API.

---

## 3. Endpoint CRUD

Pattern giống nhau cho `Customers` và `Contacts` (thay `{Entity}`):

| Thao tác | Method | Path | Body / Query |
|----------|--------|------|--------------|
| Danh sách | GET | `/api/v2/{Entity}` | `?page=0&pageSize=100&orderBy=modified_date&isDescending=true` |
| Lấy theo ID | GET | `/api/v2/{Entity}/id` | `?ids=1&ids=2` |
| Lấy theo mã | GET | `/api/v2/{Entity}/code` | `?code=KH00001` |
| **Tạo** | POST | `/api/v2/{Entity}` | `[ {record}, ... ]` (mảng) |
| **Cập nhật** | PUT | `/api/v2/{Entity}` | `[ {record}, ... ]` (mảng) |
| **Xóa** | DELETE | `/api/v2/{Entity}` | `[ 12345, ... ]` (mảng **id số nguyên**) |

`{Entity}` = `Customers` hoặc `Contacts`.

### Quy tắc CRUD (⚠️ đã kiểm chứng — dễ sai)

1. **`form_layout` là BẮT BUỘC khi TẠO và CẬP NHẬT.** Thiếu → lỗi
   `{"field_name":"form_layout","error_message":"Không được để trống"}`.
   Giá trị chuẩn: `"form_layout": "Mẫu tiêu chuẩn"`.
2. **Cập nhật (PUT) khớp bản ghi theo MÃ**, không cần `id`:
   - Khách hàng: `account_number`
   - Liên hệ: `contact_code`
   Chỉ gửi mã + các field muốn đổi (partial update OK).
3. **Xóa (DELETE) yêu cầu `id` số nguyên**, KHÔNG dùng mã.
   → Phải `GET /code?code=...` để lấy `id` rồi mới DELETE `[id]`.
4. Body POST/PUT/DELETE luôn là **mảng** (xử lý nhiều bản ghi/lần). Response trả
   `results[]` song song theo từng phần tử — **mỗi phần tử có thể thành công/thất bại riêng**.

### Định dạng response

```json
{
  "success": true,
  "code": 200,
  "results": [
    { "success": true, "data": 2107 },                       // data = id bản ghi
    { "success": false, "validate_infos": [
        { "field_name": "title", "error_message": "Dữ liệu không có trong danh mục" } ] }
  ]
}
```

→ Khi xử lý: phải kiểm tra **từng `results[i].success`**, không chỉ `success` ngoài cùng.

---

## 4. Field Khách hàng (Customers)

Object KH có ~80 field. Bảng dưới là các field **đáng dùng khi tích hợp**.

### 4.1 Field ghi được (gửi khi tạo/sửa)

| MISA field | Ý nghĩa | Loại | Gợi ý map Odoo `res.partner` |
|---|---|---|---|
| `account_number` | Mã KH (khóa khớp khi PUT) | text | `ref` hoặc `x_misa_code` |
| `account_name` | Tên KH **(bắt buộc)** | text | `name` |
| `account_short_name` | Tên viết tắt | text | `x_misa_short_name` |
| `tax_code` | Mã số thuế | text | `vat` |
| `account_type` | Loại KH | **danh mục** | `x_misa_account_type` (Selection) |
| `office_tel` | Điện thoại | text | `phone` |
| `fax` | Fax | text | — |
| `office_email` | Email | text | `email` |
| `website` | Website | text | `website` |
| `owner_name` | Người phụ trách (CRM user) | **danh mục user** | `user_id` (map theo tên) |
| `custom_field4` | **Nhân viên bán hàng** | **danh mục** (chỉ nhận giá trị trong danh sách NVBH) | `x_misa_salesperson` (xem §6) |
| `is_personal` | Cá nhân/Tổ chức | bool | `company_type` (person/company) |
| `business_type` | Loại hình DN | **danh mục** | `x_misa_business_type` |
| `sector_name` | Lĩnh vực | **danh mục** | `industry_id` |
| `industry` | Ngành nghề | **danh mục** | `x_misa_industry` |
| `no_of_employee_name` | Quy mô NV | text | — |
| `annual_revenue` | Doanh thu năm | text | — |
| `customer_since_date` | KH từ ngày | date ISO+07:00 | — |
| `celebrate_date` | Ngày sinh nhật | date ISO+07:00 | — |
| `bank_name` | Ngân hàng | text | `bank_ids` |
| `bank_account` | Số tài khoản | text | `bank_ids` |
| `debt_limit` | Hạn mức nợ | number | `credit_limit` |
| `number_of_days_owed` | Số ngày được nợ | number | — |
| `payment_term_type_id` | Điều khoản TT | **danh mục** | `property_payment_term_id` |
| `debt_limit_type` | Loại hạn mức | **danh mục** | — |
| `billing_country/province/district/ward/street` | Địa chỉ HĐ | **danh mục địa giới** | `country_id/state_id/city/street` |
| `billing_address` | Địa chỉ HĐ đầy đủ | text | `street` (gộp) |
| `shipping_*` | Địa chỉ giao hàng | **danh mục địa giới** | địa chỉ con (`type=delivery`) |
| `description` | Mô tả | text | `comment` |

> **Định dạng ngày**: `"YYYY-MM-DDT00:00:00.000+07:00"` (ví dụ `1994-01-01T00:00:00.000+07:00`).

### 4.2 Field CHỈ ĐỌC (MISA tự tính — KHÔNG gửi khi tạo/sửa)

Dùng cho màn hình hiển thị / báo cáo, **không đẩy ngược lên MISA**:

| MISA field | Ý nghĩa |
|---|---|
| `debt` | Công nợ hiện tại |
| `number_orders` | Số đơn đã mua |
| `order_sales` | Tổng doanh số |
| `average_order_value` | Giá trị TB/đơn |
| `average_number_of_days_between_purchases` | Số ngày TB giữa 2 lần mua |
| `number_days_without_purchase` | Số ngày chưa mua |
| `purchase_date_first` / `purchase_date_recent` | Ngày mua đầu / gần nhất |
| **`list_product`** | **Mã HH đã mua** — CSV: `TP-00001,TP-00003,...` |
| **`list_product_name`** | **Tên HH đã mua** — CSV cùng thứ tự với `list_product` |
| `list_product_category` | Nhóm HH đã mua |

> **"Hàng hóa đã mua"** = ghép `list_product` (mã) với `list_product_name` (tên) theo index.

---

## 5. Field Liên hệ (Contacts)

Object LH có 64 field. ⚠️ **Liên hệ KHÔNG có `custom_field4`** (chỉ có `custom_field13`,
`custom_field14` — và đó là field **danh mục**, không phải NVBH).

### 5.1 Field ghi được

| MISA field | Ý nghĩa | Loại | Gợi ý map Odoo |
|---|---|---|---|
| `contact_code` | Mã LH (khóa khớp khi PUT) | text | `x_misa_code` |
| `contact_name` | Họ tên **(bắt buộc)** | text | `name` |
| `salutation` | Xưng hô (Anh/Chị/Ông/Bà) | **danh mục** | `title` |
| `title` | Chức danh | **danh mục** | `function` |
| `account_name` | **Mã KH (tổ chức) liên kết** | text = mã KH | `parent_id` (map theo mã) |
| `mobile` | Di động | text | `mobile` |
| `office_tel` | ĐT cơ quan | text | `phone` |
| `office_email` | Email cơ quan | text | `email` |
| `email` | Email cá nhân | text | — |
| `department` | Phòng ban | text | — |
| **`custom_field14`** | **Nhân viên bán hàng** ⭐ | **danh mục** (cùng danh sách NVBH với KH) | `x_misa_salesperson` (xem §6) |
| `custom_field13` | Vùng/Miền | **danh mục** (vd "Đông Nam Bộ") | `x_misa_region` |
| `owner_name` | Người phụ trách (chủ sở hữu) | **danh mục user** | `user_id` (map theo tên) |
| `mailing_country/province/district/ward/street` | Địa chỉ | **danh mục địa giới** | địa chỉ |
| `mailing_address` | Địa chỉ đầy đủ | text | `street` |
| `shipping_*` | Địa chỉ giao hàng | **danh mục địa giới** | — |
| `date_of_birth` | Ngày sinh | date ISO+07:00 | — |
| `gender` | Giới tính | **danh mục** | — |
| `description` | Mô tả | text | `comment` |

---

## 6. ⭐ Nhân viên bán hàng (QUAN TRỌNG)

**"Nhân viên bán hàng" nằm ở field KHÁC NHAU giữa Khách hàng và Liên hệ**, nhưng **dùng
CHUNG một danh mục giá trị** (danh sách NVBH, định dạng `KMxxxx-Tên`):

| Thực thể | Field NVBH | Loại | Ví dụ |
|---|---|---|---|
| **Khách hàng** | `custom_field4` | **danh mục** (danh sách NVBH) | `KM1989-Nguyễn Văn Ân` |
| **Liên hệ** | `custom_field14` | **danh mục** (cùng danh sách NVBH) | `KM1989-Nguyễn Văn Ân` |

> ⚠️ **Đã kiểm chứng** (06/2026):
> - Liên hệ **KHÔNG có** `custom_field4` → gửi vào sẽ bị **âm thầm bỏ qua** (NULL).
>   NVBH của liên hệ là **`custom_field14`**.
> - Cả `custom_field4` (KH) và `custom_field14` (LH) đều là **field danh mục**: chỉ nhận
>   đúng giá trị trong danh sách NVBH (mục B). Giá trị lạ → `"Dữ liệu không có trong danh mục"`.
> - **➡ Gán CÙNG 1 NVBH cho cả KH và LH**: đặt **cùng một giá trị** (vd `KM1989-Nguyễn Văn Ân`)
>   vào `custom_field4` của KH và `custom_field14` của LH.
> - Liên hệ còn có `custom_field13` = **Vùng/Miền** (vd `Đông Nam Bộ`) — danh mục riêng,
>   đừng nhầm với NVBH.
> - `owner_name` (có ở cả KH & LH) là **"Người phụ trách / Chủ sở hữu"** — danh mục **CRM user**
>   (định dạng `Tên (KMxxxx)`), KHÁC với NVBH. Đừng dùng owner_name làm NVBH.
>
> _Đã verify: KH `TESTKHS` (`custom_field4`) và LH `TESTLHS` (`custom_field14`) cùng NVBH
> `KM1989-Nguyễn Văn Ân`._

### Hai danh sách giá trị (đồng bộ với màn tạo Đơn hàng)

**A. CRM users (cho `owner_name`)** — "Người thực hiện / NV bán hàng của liên hệ":
```
Đỗ Thị Mỹ Dung (ar-km@satoricompany.vn)
Hà Mộng Thúy (KM0139)
Lê Thị Hồng Hân (KM1602)
Nguyễn Thị Ngọc Thắng (KM0115)
Nguyễn Thị Tuyến (tuyen.nguyen@satoricompany.vn)
TRẦN MINH QUỐC (quoc.tran@satoricompany.vn)
Trần Ngọc Nhi (KM1847)
Trương Thanh Vũ (ktth@satoricompany.vn)
```

**B. NV bán hàng (cho `custom_field4`)** — text tự do trên KH:
```
Trần Hữu Thành
Võ Chí Thông
KM1989-Nguyễn Văn Ân
KD0209-Lê Văn Vinh
KD0045-Nguyễn Đình Việt
KD0003-Nguyễn Thị Mai Hân
KM1349-Mai Tiến Hợp
KD0002-Nguyễn Huỳnh Sơn
KD0217-Nguyễn Thị Như Thảo
KM4048-Lê Ngân Vương
KM1753-Cao Viết Thắng
KD0092-Đỗ Thành Công
KM0189-Doãn Thị Ngư
```

> Trong dự án này, hai danh sách nằm ở `frontend-v2/src/config/salespersons.ts` —
> dùng cho cả màn Khách hàng, Liên hệ và Đơn hàng (một nguồn duy nhất).

---

## 7. Các field "danh mục" (chỉ nhận giá trị có sẵn)

Gửi text tự do vào các field này → lỗi `"Dữ liệu không có trong danh mục"`.

**Khách hàng**: `account_type`, `business_type`, `sector_name`, `industry`,
`payment_term_type_id`, `debt_limit_type`, `billing_province/district/ward/country`,
`shipping_province/district/ward/country`, `owner_name`.

**Liên hệ**: `salutation`, `title`, `gender`, `mailing_province/district/ward/country`,
`custom_field13`, `custom_field14`, `owner_name`.

### Cách lấy danh mục hợp lệ

MISA Open API v2 không có endpoint danh mục trực tiếp tiện dụng. Cách thực dụng (đang dùng):
**gom giá trị distinct từ chính dữ liệu KH/LH đã có** rồi dùng làm dropdown. Trong dự án:

```
GET /api/v1/misa/categories
→ { provinces[], districts[], wards[], countries[], account_types[],
    business_types[], sectors[], industries[], titles[], salutations[] }
```
(định nghĩa: `app/api/misa.py` → hàm `misa_categories`)

Khi build trên Odoo: tạo các model danh mục (`x_misa.category.*`) và seed bằng cách
quét dữ liệu sync về, hoặc map sang danh mục gốc của Odoo (state_id, country_id…).

---

## 8. Ví dụ payload

### Tạo khách hàng
```json
POST /api/v2/Customers
[{
  "form_layout": "Mẫu tiêu chuẩn",
  "account_name": "Khách hàng Test A",
  "account_number": "TESTKHA",
  "tax_code": "0101243150",
  "office_tel": "0123456789",
  "office_email": "test-a@demo.vn",
  "custom_field4": "KM1989-Nguyễn Văn Ân",
  "owner_name": "Hà Mộng Thúy (KM0139)",
  "description": "KH demo"
}]
```
> KHÔNG kèm `billing_province` nếu giá trị không nằm trong danh mục địa giới của tenant.

### Tạo liên hệ (gắn vào KH + NVBH)
```json
POST /api/v2/Contacts
[{
  "form_layout": "Mẫu tiêu chuẩn",
  "contact_name": "Liên hệ Test A",
  "contact_code": "TESTLHA",
  "salutation": "Anh",
  "title": "Giám đốc",
  "account_name": "TESTKHA",
  "mobile": "0900000001",
  "office_email": "lh-a@demo.vn",
  "custom_field14": "KM1989-Nguyễn Văn Ân"
}]
```
> `custom_field14` = **NVBH của liên hệ** (cùng danh sách giá trị với `custom_field4` của KH).
> Để KH và LH **cùng NVBH**: đặt cùng giá trị vào `custom_field4` (KH) và `custom_field14` (LH).

### Cập nhật (partial, khớp theo mã)
```json
PUT /api/v2/Customers
[{ "form_layout": "Mẫu tiêu chuẩn", "account_number": "TESTKHA", "office_tel": "024 9999 0000" }]
```

### Xóa (theo id)
```text
GET  /api/v2/Customers/code?code=TESTKHA   → lấy "id": 2107
DELETE /api/v2/Customers   body: [2107]
```

---

## 9. Hướng dẫn cho AI (Claude) triển khai trên Odoo

> Mục tiêu: tạo một Odoo module **`misa_crm_connector`** đồng bộ 2 chiều
> Khách hàng/Liên hệ giữa MISA và `res.partner`.

### 9.1 Cấu trúc module
```
misa_crm_connector/
├── __manifest__.py
├── models/
│   ├── misa_client.py          # lớp gọi API MISA (auth + CRUD)
│   ├── res_partner.py          # mở rộng res.partner: thêm field MISA
│   └── misa_sync.py            # service đồng bộ 2 chiều
├── data/
│   └── ir_cron.xml             # cron đồng bộ định kỳ
└── security/ir.model.access.csv
```

### 9.2 Field thêm vào `res.partner`
```python
class ResPartner(models.Model):
    _inherit = "res.partner"

    x_misa_id = fields.Integer("MISA ID", index=True, copy=False)   # id số → để DELETE
    x_misa_code = fields.Char("MISA Code", index=True, copy=False)  # account_number / contact_code
    x_misa_salesperson = fields.Char("NV bán hàng (MISA)")          # KH: custom_field4
    # owner_name → map sang user_id (Salesperson chuẩn của Odoo) theo tên
    x_misa_account_type = fields.Char("Loại KH (MISA)")
    x_misa_synced_at = fields.Datetime("Lần sync MISA gần nhất")
```

### 9.3 Lớp client (rút gọn)
```python
import json, time, base64, requests

class MisaClient:
    BASE = "https://crmconnect.misa.vn"
    def __init__(self, app_id, secret):
        self.app_id, self.secret = app_id, secret
        self._token, self._exp = None, 0
    def _auth(self):
        r = requests.post(f"{self.BASE}/api/v2/Account",
                          json={"client_id": self.app_id, "client_secret": self.secret}, timeout=30)
        r.raise_for_status(); tok = r.json()["data"]
        payload = tok.split(".")[1]; payload += "=" * (-len(payload) % 4)
        self._exp = json.loads(base64.b64decode(payload)).get("exp", time.time() + 3600)
        self._token = tok
    def _headers(self):
        if not self._token or time.time() > self._exp - 60: self._auth()
        return {"Authorization": f"Bearer {self._token}", "Clientid": self.app_id}
    def list(self, entity, page=0, size=100):
        return requests.get(f"{self.BASE}/api/v2/{entity}",
            headers=self._headers(),
            params={"page": page, "pageSize": size, "orderBy": "modified_date", "isDescending": True},
            timeout=30).json()
    def by_code(self, entity, code):
        return requests.get(f"{self.BASE}/api/v2/{entity}/code",
            headers=self._headers(), params={"code": code}, timeout=30).json()
    def create(self, entity, records):   # records: list[dict]
        return requests.post(f"{self.BASE}/api/v2/{entity}", headers=self._headers(), json=records, timeout=30).json()
    def update(self, entity, records):
        return requests.put(f"{self.BASE}/api/v2/{entity}", headers=self._headers(), json=records, timeout=30).json()
    def delete(self, entity, ids):       # ids: list[int]
        return requests.request("DELETE", f"{self.BASE}/api/v2/{entity}", headers=self._headers(), json=ids, timeout=30).json()
```

### 9.4 Mapping MISA → Odoo (Khách hàng)
```python
def misa_customer_to_partner_vals(o):
    return {
        "name": o["account_name"],
        "company_type": "person" if o.get("is_personal") else "company",
        "x_misa_id": o.get("id"),
        "x_misa_code": o.get("account_number"),
        "vat": o.get("tax_code") or False,
        "phone": o.get("office_tel") or False,
        "email": o.get("office_email") or False,
        "website": o.get("website") or False,
        "comment": o.get("description") or False,
        "x_misa_salesperson": o.get("custom_field4") or False,   # ⭐ NVBH
        "x_misa_account_type": o.get("account_type") or False,
        # user_id: tra res.users theo tên trong owner_name "Tên (KMxxxx)"
        # street/city/state_id/country_id: map từ billing_* (xem §7 — cần danh mục)
    }
```

### 9.5 Mapping Odoo → MISA (đẩy ngược)
```python
def partner_to_misa_customer(p):
    vals = {"form_layout": "Mẫu tiêu chuẩn", "account_name": p.name}
    if p.x_misa_code:    vals["account_number"] = p.x_misa_code      # khóa khớp khi PUT
    if p.vat:            vals["tax_code"] = p.vat
    if p.phone:          vals["office_tel"] = p.phone
    if p.email:          vals["office_email"] = p.email
    if p.website:        vals["website"] = p.website
    if p.x_misa_salesperson: vals["custom_field4"] = p.x_misa_salesperson  # ⭐ NVBH (KH)
    # ⚠️ KHÔNG đẩy billing_province/district/ward nếu không chắc khớp danh mục
    # ⚠️ KHÔNG đẩy field chỉ-đọc: debt, number_orders, order_sales, list_product...
    return vals
```

### 9.6 Quy tắc BẮT BUỘC khi code connector (checklist)
- [ ] **Luôn** gắn `"form_layout": "Mẫu tiêu chuẩn"` khi POST **và** PUT.
- [ ] PUT: gửi **mã** (`account_number`/`contact_code`) làm khóa, partial update OK.
- [ ] DELETE: lấy `id` qua `/code` trước, rồi DELETE `[id]` (số nguyên).
- [ ] Đọc **từng `results[i].success`**; log `validate_infos` khi lỗi.
- [ ] NVBH: KH → `custom_field4`; **LH → `custom_field14`** (cùng danh mục giá trị; KHÔNG dùng custom_field4 cho LH, cũng đừng nhầm owner_name).
- [ ] Không đẩy field danh mục với giá trị tự do (province, account_type, title, salutation…).
- [ ] Không đẩy ngược field chỉ-đọc (mục §4.2).
- [ ] Liên hệ liên kết KH qua `account_name` = **mã KH** (không phải tên).
- [ ] Ngày: format `YYYY-MM-DDT00:00:00.000+07:00`.

### 9.7 Đồng bộ "Hàng hóa đã mua" sang Odoo
`list_product` + `list_product_name` là CSV cùng thứ tự. Khi hiển thị trên Odoo:
```python
codes = (o.get("list_product") or "").split(",")
names = (o.get("list_product_name") or "").split(",")
purchased = [{"code": c.strip(), "name": (names[i].strip() if i < len(names) else "")}
             for i, c in enumerate(codes) if c.strip()]
```
Có thể lưu vào một model phụ `x_misa.purchased.product` (one2many trên partner) hoặc chỉ hiển thị read-only.

---

## 10. Lỗi thường gặp (đã kiểm chứng)

| Thông báo MISA | Nguyên nhân | Cách xử lý |
|---|---|---|
| `form_layout: Không được để trống` | Thiếu `form_layout` khi POST/PUT | Thêm `"Mẫu tiêu chuẩn"` |
| `billing_province: Dữ liệu không có trong danh mục` | Tỉnh/TP không khớp danh mục địa giới | Bỏ field hoặc chọn từ danh mục |
| `title: Dữ liệu không có trong danh mục` | Chức danh tự do | Chỉ chọn giá trị có sẵn (vd "Giám đốc") |
| `custom_field13: Dữ liệu không có trong danh mục` | custom_field13/14 là dropdown | Chỉ gửi giá trị danh mục |
| `custom_field4` lưu NULL ở Liên hệ | LH không có field này | NVBH của LH là `custom_field14` |
| `custom_field4`/`custom_field14`: Dữ liệu không có trong danh mục | NVBH là field danh mục | Chỉ gửi giá trị trong danh sách NVBH (`KMxxxx-Tên`) |
| Xóa không tác dụng / lỗi | Gửi mã thay vì id | Lấy `id` qua `/code` rồi DELETE |

---

_Tài liệu này phản ánh hành vi MISA CRM Open API v2 quan sát thực tế (tenant `MONGTHUY`,
06/2026). Khi đổi tenant, danh mục (tỉnh/loại KH/chức danh/CRM user) sẽ khác — luôn lấy
danh mục theo tenant đang dùng._
