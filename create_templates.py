#!/usr/bin/env python3
"""
Tạo hàng loạt 18 template PO cho các khách hàng của Satori.
Chạy: python3 create_templates.py
"""
import requests, json

BASE = "http://localhost:8000/api/v1"

_JSON_SCHEMA = """\nReturn valid JSON only (no markdown):
{
  "document_type": "purchase_order",
  "order_number": "string or null",
  "order_date": "YYYY-MM-DD or null",
  "currency": "VND",
  "payment_method": "string or null",
  "recipient_name": "string or null",
  "description": null,
  "customer_name": "string or null",
  "customer_tax_code": "string or null",
  "vendor_name": "SATORI",
  "vendor_tax_code": "0302056457",
  "delivery_address": "string or null",
  "total_amount": null,
  "discount_amount": null,
  "tax_amount": null,
  "items": [{"product_code": "string or null", "product_name": "string",
    "quantity": null, "unit": "string or null", "unit_price": null,
    "discount_rate": null, "discount_amount": null, "tax_rate": null, "line_total": null}]
}"""

TEMPLATES = [

# ─────────────────────────────────────────────────────────────────────────────
# ALIAS MODE — format chuẩn, chỉ tên cột khác
# ─────────────────────────────────────────────────────────────────────────────

{
    "name": "Sanha — PURCHASE ORDER (STORE)",
    "document_type": "purchase_order",
    "field_aliases": {
        "order_number":       ["Số PO", "Số chứng từ"],
        "order_date":         ["Ngày chứng từ", "Ngày nhập"],
        "delivery_address":   ["Ship to"],
        "payment_method":     ["Phương thức thanh toán"],
        "items.product_code": ["Item No.", "Mã vạch"],
        "items.product_name": ["Description"],
        "items.unit":         ["UoM"],
        "items.quantity":     ["Quantity"],
        "items.unit_price":   ["Price"],
        "items.line_total":   ["Total"],
    }
},

{
    "name": "NS Nhân Văn — Đơn hàng",
    "document_type": "purchase_order",
    "field_aliases": {
        "order_number":       ["PO số"],
        "order_date":         ["Ngày đặt hàng"],
        "delivery_address":   ["Địa chỉ giao hàng", "Giao hàng tại kho"],
        "items.product_code": ["Mã hàng"],
        "items.product_name": ["Tên hàng"],
        "items.unit":         ["Đvt"],
        "items.quantity":     ["Số lượng"],
        "items.unit_price":   ["Đơn Giá", "Đơn giá sau Ck"],
        "items.line_total":   ["Thành tiền"],
    }
},

{
    "name": "FamilyMart — Đơn đặt hàng",
    "document_type": "purchase_order",
    "field_aliases": {
        "order_number":       ["SỐ ĐƠN ĐẶT HÀNG"],
        "order_date":         ["NGÀY ĐẶT HÀNG"],
        "delivery_address":   ["GIAO TỚI"],
        "items.product_code": ["MÃ VẠCH"],
        "items.product_name": ["TÊN HÀNG"],
        "items.unit":         ["QUY CÁCH ĐÓNG GÓI"],
        "items.quantity":     ["TỔNG SỐ LƯỢNG", "SỐ LƯỢNG"],
        "items.unit_price":   ["ĐƠN GIÁ (Chưa VAT)", "ĐƠN GIÁ"],
        "items.line_total":   ["THÀNH TIỀN"],
    }
},

{
    "name": "Satrafoods — Đơn đặt hàng",
    "document_type": "purchase_order",
    "field_aliases": {
        "order_number":       ["Đơn đặt hàng số"],
        "order_date":         ["Ngày đặt hàng"],
        "delivery_address":   ["Nơi giao hàng", "Địa chỉ giao hàng"],
        "customer_name":      ["Đơn vị mua hàng"],
        "items.product_code": ["Mã hàng", "Barcode"],
        "items.product_name": ["Tên hàng hóa"],
        "items.unit":         ["Đơn vị"],
        "items.quantity":     ["Số lượng"],
        "items.unit_price":   ["Đơn giá"],
        "items.line_total":   ["Thành tiền"],
    }
},

{
    "name": "MM Mega Market — Đơn đặt hàng",
    "document_type": "purchase_order",
    "field_aliases": {
        "order_number":       ["Số thứ tự đơn đặt hàng"],
        "order_date":         ["Ngày đặt hàng"],
        "delivery_address":   ["ĐỊA ĐIỂM GIAO HÀNG", "Địa chỉ"],
        "customer_name":      ["NGƯỜI MUA", "Tên"],
        "items.product_code": ["EAN sản phẩm"],
        "items.product_name": ["Tên hàng hóa"],
        "items.quantity":     ["Số lượng"],
        "items.unit_price":   ["Đơn giá"],
        "items.line_total":   ["Thành tiền"],
    }
},

{
    "name": "GS25 — Đơn đặt hàng",
    "document_type": "purchase_order",
    "field_aliases": {
        "order_number":       ["WH003", "WH0030"],
        "order_date":         ["Ngày đặt hàng"],
        "delivery_address":   ["Địa chỉ"],
        "items.product_code": ["Mã hàng"],
        "items.product_name": ["Hàng hóa"],
        "items.unit":         ["Đ/V"],
        "items.quantity":     ["Số lượng"],
        "items.unit_price":   ["Đơn giá"],
        "items.tax_rate":     ["VAT(%)"],
        "items.discount_rate":["KM giảm giá", "PO Chiết khấu"],
        "items.line_total":   ["Thành tiền (VNĐ)", "Thành tiền"],
    }
},

{
    "name": "Vissan — Đơn đặt hàng",
    "document_type": "purchase_order",
    "field_aliases": {
        "delivery_address":   ["Địa Chỉ", "Tên Siêu Thị"],
        "items.product_code": ["Mã Sản Phẩm"],
        "items.product_name": ["Tên Sản Phẩm"],
        "items.unit":         ["Quy Cách"],
        "items.quantity":     ["SL Đặt"],
    }
},

{
    "name": "Menas Gourmet — Đơn đặt hàng",
    "document_type": "purchase_order",
    "field_aliases": {
        "order_number":       ["SỐ ĐẶT HÀNG (PO No.)", "PO No."],
        "order_date":         ["NGÀY ĐẶT HÀNG (PO Date.)", "PO Date."],
        "delivery_address":   ["ĐỊA CHỈ GIAO HÀNG (SHIP ADDRESS)"],
        "items.product_code": ["Mã hàng (Barcode)", "Mã vạch (Barcode)"],
        "items.product_name": ["Tên sản phẩm (Item description)"],
        "items.unit":         ["ĐVT (Unit)"],
        "items.quantity":     ["Số lượng (Quantity)"],
        "items.unit_price":   ["Đơn giá (Purchase price)"],
        "items.tax_rate":     ["Thuế suất"],
        "items.line_total":   ["Thành tiền (Amount)"],
    }
},

{
    "name": "Ministop — Purchase Order",
    "document_type": "purchase_order",
    "field_aliases": {
        "order_number":       ["Order No.", "Đơn Đặt Hàng Số"],
        "order_date":         ["Order Date", "Ngày Đặt Hàng"],
        "delivery_address":   ["Delivered To", "Giao Hàng Tới"],
        "items.product_code": ["Barcode", "Mã Vạch", "Item Code"],
        "items.product_name": ["Article Description", "Tên hàng"],
        "items.unit":         ["UOM", "Đvt"],
        "items.quantity":     ["Qty", "Số lượng"],
        "items.unit_price":   ["Unit Price", "Đơn Giá"],
        "items.line_total":   ["Amount", "Thành Tiền"],
    }
},

{
    "name": "WinMart — Đơn đặt hàng",
    "document_type": "purchase_order",
    "field_aliases": {
        "order_number":       ["Số đơn hàng (PO No.)", "PO No."],
        "order_date":         ["Ngày đặt hàng (PO date)"],
        "delivery_address":   ["Địa chỉ giao hàng (Delivery Address)"],
        "items.product_code": ["Mã vạch (Barcode)"],
        "items.product_name": ["Tên hàng (Item Description)"],
        "items.unit":         ["ĐVT (Unit)"],
        "items.quantity":     ["Số lượng (Quantity)"],
        "items.unit_price":   ["Đơn giá (Unit Price)"],
        "items.line_total":   ["Thành tiền (VND) (Amount)", "Thành tiền"],
    }
},

{
    "name": "Mr. DIY (Cúc Tây) — Purchase Order",
    "document_type": "purchase_order",
    "field_aliases": {
        "order_number":       ["OUR REF NO"],
        "order_date":         ["DELIVERY DATE", "DATE"],
        "delivery_address":   ["SHIP TO"],
        "items.product_code": ["PLU CODE", "BARCODE"],
        "items.product_name": ["DESCRIPTION"],
        "items.unit":         ["SIZE"],
        "items.quantity":     ["QTY"],
        "items.unit_price":   ["UNIT COST"],
        "items.line_total":   ["TOTAL"],
    }
},

# ─────────────────────────────────────────────────────────────────────────────
# CUSTOM PROMPT MODE — format phức tạp hoặc tiếng Anh viết tắt
# ─────────────────────────────────────────────────────────────────────────────

{
    "name": "Joyco Retail — Đặt hàng",
    "document_type": "purchase_order",
    "system_prompt": (
        "You are extracting data from a JOYCO RETAIL OPERATIONS purchase order sent to SATORI.\n"
        "Column mapping:\n"
        "- ST = STT (row number)\n"
        "- Mã vạch = product_code (barcode)\n"
        "- Tên mặt hàng = product_name\n"
        "- Quy cách = pack size (units per box, informational)\n"
        "- Số Lượng = quantity (number of boxes/thùng)\n"
        "- Đơn vị mua hàng = unit (thùng/chai)\n"
        "- Đơn giá thùng sau VAT = unit_price (price per box including VAT)\n"
        "- Tổng giá sau VAT = line_total (total including VAT)\n"
        "Header fields:\n"
        "- SỐ PO = order_number\n"
        "- Ngày đặt đơn = order_date (YYYY-MM-DD)\n"
        "- Địa chỉ giao hàng = delivery_address\n"
        "- Người nhận hàng = recipient_name\n"
        "- CÔNG TY TNHH JOYCO RETAIL OPERATIONS = customer_name\n"
        + _JSON_SCHEMA
    ),
},

{
    "name": "Emart (Thiso Retail) — Purchase Order",
    "document_type": "purchase_order",
    "system_prompt": (
        "You are extracting data from an EMART / THISO RETAIL COMPANY LIMITED purchase order.\n"
        "The document title is 'Purchase Order (PO Type: Standard PO)'.\n"
        "Column mapping in the item table:\n"
        "- Article Code = internal item code (use as product_code if no barcode)\n"
        "- Unit Barcode (Mã vạch lẻ) = product_code (barcode)\n"
        "- Unit Barcode Description (Tên sản phẩm lẻ) = product_name\n"
        "- PO Unit = unit (BOX/EA)\n"
        "- Qty. inBox = pack size (units per box, informational)\n"
        "- PO Qty. = quantity (number of boxes ordered)\n"
        "- Pur. Price (-VAT) = unit_price (price per box, excluding VAT)\n"
        "- Amount (-VAT) = line_total (excluding VAT)\n"
        "Header fields:\n"
        "- PO No. = order_number\n"
        "- Order By / Date (date part) = order_date (YYYY-MM-DD)\n"
        "- Delivery Date = order_date if no Order By Date\n"
        "- Delivery to = delivery_address\n"
        "- Vendor = vendor_name (SATORI)\n"
        "- VAT % = tax_rate for all items\n"
        + _JSON_SCHEMA
    ),
},

{
    "name": "Lotte Mart — Ord sheet",
    "document_type": "purchase_order",
    "system_prompt": (
        "You are extracting data from a LOTTE MART 'Ord sheet' (order sheet) sent to SATORI.\n"
        "This document uses English abbreviations. Column mapping:\n"
        "- Seq = row number\n"
        "- Prod cd = Lotte internal product code\n"
        "- Sale cd = barcode (product_code)\n"
        "- BarCode = barcode image (same as Sale cd)\n"
        "- Prod nm = product_name\n"
        "- Spec = size/spec (e.g. 500ML)\n"
        "- Uom = pack unit (e.g. 24)\n"
        "- Ord unit = order unit (BOX)\n"
        "- Ord qty = quantity ordered (number of boxes)\n"
        "- Sply qty = supply quantity (use as quantity if Ord qty is blank)\n"
        "- Sply prc = unit_price (supply price per box)\n"
        "- Sply amt = line_total\n"
        "- Tax rt = tax_rate (%)\n"
        "Header fields:\n"
        "- Ord slip no (Ord slip no field) = order_number\n"
        "- Ord dt = order_date (YYYY-MM-DD)\n"
        "- Sply dt = delivery date\n"
        "- S/P Mst No. = vendor tax code (supplier MST)\n"
        "- C/E Comp nm = customer_name (Lotte entity)\n"
        + _JSON_SCHEMA
    ),
},

{
    "name": "BigC / GO! — Purchase Note",
    "document_type": "purchase_order",
    "system_prompt": (
        "You are extracting data from a BIG C / GO! 'PURCHASE NOTE' sent to SATORI.\n"
        "Column mapping in the item table:\n"
        "- Article = barcode (product_code)\n"
        "- Article Desc = product_name\n"
        "- OU Type = type (Pack/EA)\n"
        "- LV = level\n"
        "- SKU/OU = pack size (units per box)\n"
        "- OU Qty = quantity (number of packs/boxes ordered)\n"
        "- Net Purchase Price = unit_price (price per INDIVIDUAL unit, excluding VAT)\n"
        "- Unit = unit of measurement\n"
        "- Total Net Purchase Price = line_total (excluding VAT)\n"
        "Header fields:\n"
        "- Order No = order_number\n"
        "- Order Date = order_date (YYYY-MM-DD, format DD/MM/YY)\n"
        "- Supplier Code = (informational)\n"
        "- Delivered To / For Store = delivery_address and customer_name\n"
        "- By Supplier = vendor info (SATORI)\n"
        "- Delivery Date To Store = use for order_date if Order Date missing\n"
        "- TOTAL BF.TAX = total_amount\n"
        "- TOTAL VAT = tax_amount\n"
        + _JSON_SCHEMA
    ),
},

{
    "name": "KingFood Market — Đơn đặt hàng",
    "document_type": "purchase_order",
    "system_prompt": (
        "You are extracting data from a KINGFOOD MARKET purchase order sent to SATORI.\n"
        "The item table has many columns. Use these mappings:\n"
        "- STT = row number\n"
        "- Barcode = product_code\n"
        "- Tên sản phẩm = product_name\n"
        "- ĐVT = unit\n"
        "- Số lượng = total quantity in individual units (e.g. CHAI)\n"
        "- Quy cách Thùng/Pack = pack size (units per box)\n"
        "- Số lượng Thùng/Pack = quantity in boxes\n"
        "- Đơn giá chào (-VAT) = list price before discount, excluding VAT\n"
        "- CK trực tiếp = direct discount rate (%)\n"
        "- % KM Giảm Giá = promotional discount rate (%)\n"
        "- Đơn giá cuối (-VAT) = unit_price (final price after discount, excluding VAT)\n"
        "- % VAT = tax_rate\n"
        "- Giá trị (VAT) = VAT amount for the line\n"
        "- Thành tiền (-VAT) = line subtotal excluding VAT\n"
        "- Thành tiền (+VAT) = line_total (total including VAT) — use this\n"
        "Header fields:\n"
        "- PO Number = order_number\n"
        "- Ngày Đặt Hàng = order_date (YYYY-MM-DD)\n"
        "- Địa chỉ giao hàng = delivery_address\n"
        "- CÔNG TY CỔ PHẦN KING FOOD MARKET = customer_name\n"
        "- Tổng tiền (-VAT) = total_amount\n"
        "- Giá trị VAT = tax_amount\n"
        "- Tổng tiền (+VAT) = use for total if present\n"
        + _JSON_SCHEMA
    ),
},

{
    "name": "Circle K — Purchase Order",
    "document_type": "purchase_order",
    "system_prompt": (
        "You are extracting data from a CIRCLE K (Công ty TNHH Vòng Tròn Đỏ) purchase order.\n"
        "The document is bilingual (Vietnamese/English). Column mapping:\n"
        "- STT No. = row number\n"
        "- MÃ SẢN PHẨM CK / CK Item Code = Circle K internal code\n"
        "- MÃ HÀNG CỦA NCC / Vendor's Item Code = supplier code (informational)\n"
        "- MÃ VẠCH / Barcode = product_code (barcode)\n"
        "- TÊN HÀNG HÓA / Descriptions = product_name\n"
        "- ĐVT / Unit = unit\n"
        "- SL/THÙNG / Unit Qty/Case = pack size (units per case)\n"
        "- SL ĐẶT HÀNG / Order Qty = quantity (individual units)\n"
        "- SL HÀNG KM / FOC Qty/Discount = free goods quantity (skip for quantity)\n"
        "- ĐƠN GIÁ / Unit Price (VND) = unit_price (per individual unit)\n"
        "- TẠM TÍNH / Sub Total (VND) = subtotal before tax\n"
        "- THUẾ SUẤT / VAT Rate = tax_rate\n"
        "- THUẾ / Tax (VND) = tax per line\n"
        "- THÀNH TiỀN / Total (VND) = line_total (subtotal + tax)\n"
        "Header fields:\n"
        "- Số hiệu đơn hàng / P.O. # = order_number\n"
        "- Ngày đặt hàng / Date = order_date (YYYY-MM-DD)\n"
        "- Ngày giao hàng / Delivery Date Suggested = delivery date (informational)\n"
        "- NHÀ CUNG CẤP/VENDOR → Tên/Company = vendor_name (SATORI)\n"
        "- ĐỊA ĐiỂM GIAO HÀNG/DELIVER TO → Cửa hàng(Kho) = delivery_address\n"
        "- CÔNG TY TNHH VÒNG TRÒN ĐỎ = customer_name\n"
        "- Tổng số tiền chưa thuế / Net total amount = total_amount\n"
        "- Thuế GTGT / VAT amount = tax_amount\n"
        + _JSON_SCHEMA
    ),
},

{
    "name": "Ohmee (Kim Lam) — Purchase Order",
    "document_type": "purchase_order",
    "system_prompt": (
        "You are extracting data from an OHMEE (CÔNG TY TNHH KIM LÂM ENJOY MART) purchase order.\n"
        "IMPORTANT: The table has FOC (free goods/hàng KM) rows where the price columns are empty.\n"
        "Skip rows where 'Đơn giá (VND)' is empty or zero — those are free goods.\n"
        "Column mapping:\n"
        "- STT = row number\n"
        "- Mã sản phẩm = (may be empty)\n"
        "- Mã vạch = product_code (barcode)\n"
        "- Tên sản phẩm = product_name\n"
        "- ĐVT = unit\n"
        "- Số thùng = quantity in boxes (informational)\n"
        "- Số lượng = quantity in individual units — use this as quantity\n"
        "- Hàng KM = free goods quantity (informational, do NOT add to quantity)\n"
        "- Đơn giá (VND) = unit_price (excluding VAT)\n"
        "- Tạm tính (VND) = subtotal before tax\n"
        "- VAT (%) = tax_rate\n"
        "- VAT (VND) = tax amount per line\n"
        "- Thành tiền = line_total (including VAT)\n"
        "Header fields:\n"
        "- Số hiệu đơn hàng = order_number\n"
        "- Ngày đặt hàng = order_date (YYYY-MM-DD)\n"
        "- Địa chỉ (delivery location) = delivery_address\n"
        "- CÔNG TY TNHH KIM LÂM ENJOY MART = customer_name\n"
        "- Tổng tiền trước thuế = total_amount\n"
        "- Thuế GTGT = tax_amount\n"
        "- Tổng cộng = use for total if present\n"
        + _JSON_SCHEMA
    ),
},

]  # end TEMPLATES


def main():
    ok = 0
    fail = 0
    for t in TEMPLATES:
        name = t["name"]
        payload = {
            "name": name,
            "document_type": t["document_type"],
            "output_schema": {},
        }
        if "field_aliases" in t:
            payload["field_aliases"] = t["field_aliases"]
        if "system_prompt" in t:
            payload["system_prompt"] = t["system_prompt"]

        r = requests.post(f"{BASE}/templates", json=payload)
        if r.ok:
            d = r.json()
            print(f"  ✅  {d['name']}  (#{d['code']})")
            ok += 1
        else:
            print(f"  ❌  {name}  →  {r.status_code}: {r.text[:200]}")
            fail += 1

    print(f"\nKết quả: {ok} thành công, {fail} thất bại / tổng {len(TEMPLATES)}")


if __name__ == "__main__":
    main()
