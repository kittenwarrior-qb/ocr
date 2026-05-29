"""
Purchase Order Pattern Rules (Python port)
Tất cả regex rules trong 1 file duy nhất.
Focus: ngày đặt, ngày giao, tổng tiền, mã PO, items
"""
import re
from typing import Any


def normalize_text(text: str) -> str:
    """Normalize text giữ line breaks"""
    text = str(text or '')
    text = text.replace('\r', '\n')
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def normalize_one_line(text: str) -> str:
    """Flatten text thành 1 dòng"""
    return re.sub(r'\n+', ' ', normalize_text(text))


def parse_number(value) -> float | None:
    """Parse số từ nhiều format: 1,500,000 / 1.500.000 / 1500000"""
    if value is None or value == '':
        return None
    normalized = re.sub(r'[^\d,.\-]', '', str(value))
    
    comma_count = normalized.count(',')
    dot_count = normalized.count('.')
    
    if comma_count and dot_count:
        if normalized.rfind(',') > normalized.rfind('.'):
            normalized = normalized.replace('.', '').replace(',', '.')
        else:
            normalized = normalized.replace(',', '')
    elif comma_count:
        if comma_count > 1 or re.search(r',\d{3}$', normalized):
            normalized = normalized.replace(',', '')
        else:
            normalized = normalized.replace(',', '.')
    elif dot_count:
        if dot_count > 1 or re.search(r'\.\d{3}$', normalized):
            normalized = normalized.replace('.', '')
    
    try:
        result = float(normalized)
        return result if result == result else None  # NaN check
    except (ValueError, TypeError):
        return None


def normalize_date(value: str) -> str | None:
    """Normalize date sang DD/MM/YYYY"""
    if not value:
        return None
    
    # Format: "Ngày X tháng Y năm Z"
    m = re.search(r'(\d{1,2})\s+th.ng\s+(\d{1,2})\s+n.m\s+(\d{4})', str(value), re.IGNORECASE)
    if m:
        return f"{m.group(1).zfill(2)}/{m.group(2).zfill(2)}/{m.group(3)}"
    
    # Format: DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY or YYYY-MM-DD
    m = re.search(r'(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})', str(value))
    if not m:
        return None
    
    day, month, year = m.group(1), m.group(2), m.group(3)
    if len(day) == 4:  # YYYY-MM-DD
        year, month, day = day, month, year
    
    if len(year) == 2:
        year = f"20{year}"
    
    return f"{day.zfill(2)}/{month.zfill(2)}/{year}"


def first_match(text: str, pattern, fallback=None) -> str | None:
    """Tìm match đầu tiên"""
    m = pattern.search(text)
    if not m:
        return fallback
    # Tìm group đầu tiên không rỗng
    for i in range(1, len(m.groups()) + 1):
        if m.group(i) is not None:
            return m.group(i).strip()
    return fallback


# ═══════════════════════════════════════════════════════════════════════════════
# HEADER RULES - Trích xuất thông tin header
# ═══════════════════════════════════════════════════════════════════════════════

MA_PO_PATTERNS = [
    re.compile(r'S\u1ed0 \u0110\u1eb6T H\u00c0NG \(PO No\.\)\s+(PO\d+-\d+)', re.I),
    re.compile(r'P/O Number:\s+(\d+-\d+)', re.I),
    re.compile(r'^(\d{13})\s+\d{1,2}/\d{1,2}/\d{2}', re.M),
    re.compile(r'M\u00e3 s\u1ed1:\s+(P-\d+)', re.I),
    re.compile(r'(PR-\d+-[A-Z0-9]+)', re.I),
    re.compile(r'(0027\d+)', re.I),
    re.compile(r'Ord sheet\s+(\d{16})', re.I),
    re.compile(r'(IND\d+)', re.I),
    re.compile(r'(NVV\d+)', re.I),
    re.compile(r'S\u1ed0 \u0110\u01a0N \u0110\u1eb6T H\u00c0NG\s+([A-Z0-9]+)', re.I),
    re.compile(r'S\u1ed1 th\u1ee9 t\u1ef1 \u0111\u01a1n \u0111\u1eb7t h\u00e0ng\s+([\d.]+)', re.I),
    re.compile(r'(?:S\u1ed0 PO|PO Number|PO No\.?|S\u1ed1 PO|OUR REF NO|S\u1ed1 hi\u1ec7u \u0111\u01a1n h\u00e0ng|S\u1ed1 phi\u1ebfu giao h\u00e0ng|P\.O\. #)\s*[:：]?\s*([A-Z0-9._/-]+)', re.I),
    re.compile(r'S\u1ed1 ch\u1ee9ng t\u1eeb:\s*([A-Z0-9._/-]+)', re.I),
    re.compile(r'\b(PO[A-Z0-9._/-]{6,})\b', re.I),
    re.compile(r'PO s\u1ed1:\s*([A-Z0-9._/-]+)', re.I),
    re.compile(r'Supplier Delivery ID\)\s+([A-Z0-9]+)', re.I),
    re.compile(r'\u0110\u01a1n \u0110\u1eb7t H\u00e0ng S\u1ed1\s+([A-Z0-9]+)', re.I),
]

NGAY_DAT_PATTERNS = [
    re.compile(r'OUR REF NO\s*:\s*\d+\s+(\d{1,2}/\d{1,2}/\d{4})', re.I),
    re.compile(r'NG\u00c0Y \u0110\u1eb6T H\u00c0NG \(PO Date\.\)\s+(\d{1,2}/\d{1,2}/\d{4})', re.I),
    re.compile(r'Ng\u00e0y \u0111\u1eb7t h\u00e0ng\s+(\d{1,2}\.\d{1,2}\.\d{4})', re.I),
    re.compile(r'Ord dt\s*:\s*(\d{1,2}/\d{1,2}/\d{4})', re.I),
    re.compile(r'Order Date.*?(\d{1,2}-\d{1,2}-\d{4})', re.I),
    re.compile(r'Date\s+(\d{1,2}/\d{1,2}/\d{2,4})', re.I),
    re.compile(r'H\u00e0ng ph\u1ee5c v\u1ee5 cho:\s+(\d{1,2}/\d{1,2}/\d{4})', re.I),
    re.compile(r'Trang\s+\d+\s+/\d+\s+(\d{1,2}\.\d{1,2}\.\d{4})', re.I),
    re.compile(r'Ng\u00e0y \u0110\u1eb7t H\u00e0ng:\s*(\d{1,4}[./-]\d{1,2}[./-]\d{1,4})', re.I),
    re.compile(r'(?:Ng\u00e0y \u0111\u1eb7t \u0111\u01a1n|NG\u00c0Y \u0110\u1eb6T H\u00c0NG|Ng\u00e0y \u0111\u1eb7t h\u00e0ng|PO Date|DATE|Ng\u00e0y ch\u1ee9ng t\u1eeb|Entry Date)\s*[:：-]?\s*(\d{1,4}[./-]\d{1,2}[./-]\d{1,4})', re.I),
]

NGAY_GIAO_PATTERNS = [
    re.compile(r'Ng\u00e0y giao h\u00e0ng:\s+P-[^\n]+\s+(\d{1,2}/\d{1,2}/\d{4})', re.I),
    re.compile(r'Ng\u00e0y giao h\u00e0ng\s*:\s*\(Delivery date\)\s+(\d{1,2}/\d{1,2}/\d{4})', re.I),
    re.compile(r'Ng\u00e0y giao\s+\(Delivery Date\)\s+(\d{1,2}\.\d{1,2}\.\d{4})', re.I),
    re.compile(r'Ng\u00e0y giao h\u00e0ng d\u1ef1 ki\u1ebfn\s+(\d{1,2}/\d{1,2}/\d{4})', re.I),
    re.compile(r'Delivery Date Requested.*?(\d{1,2}-\d{1,2}-\d{4})', re.I | re.S),
    re.compile(r'NG\u00c0Y GIAO H\u00c0NG \(Delivery Date\)\s+(\d{1,2}/\d{1,2}/\d{4})', re.I),
    re.compile(r'Giao h\u00e0ng ng\u00e0y\s+(\d{1,2}\.\d{1,2}\.\d{4})', re.I),
    re.compile(r'Ng\u00e0y Giao H\u00e0ng D\u1ef1 Ki\u1ebfn:\s*(\d{1,2}-\d{1,2}-\d{4})', re.I),
    re.compile(r'Delivery Date\s+To Store[^\n]+\s+(\d{1,2}/\d{1,2}/\d{2})', re.I),
    re.compile(r'(?:Ng\u00e0y Giao H\u00e0ng|NG\u00c0Y GIAO H\u00c0NG|Delivery Date|Ng\u00e0y giao|Expected Receipt Date)\s*[:：-]?\s*(\d{1,4}[./-]\d{1,2}[./-]\d{1,4})', re.I),
]

TONG_TIEN_PATTERNS = [
    re.compile(r'Th\u00e0nh ti\u1ec1n \(\+VAT\)\s*:?\s*([\d.,]+)', re.I),
    re.compile(r'Th\u00e0nh ti\u1ec1n\s*\(\+VAT\)\s*([\d.,]+)', re.I),
    re.compile(r'Grand Total\s*:?\s*([\d.,]+)', re.I),
    re.compile(r'T\u1ed4NG C\u1ed8NG\s+.*?Th\u00e0nh ti\u1ec1n \(No VAT\)\s*([\d.,]+)', re.I | re.S),
    re.compile(r'Total Net Purchase\s*:?\s*([\d.,]+)', re.I),
    re.compile(r'TOTAL\s+BF\.TAX\s*([\d.,]+)', re.I),
    re.compile(r'T\u1ed5ng gi\u00e1 tr\u1ecb\s*:?\s*([\d.,]+)', re.I),
    re.compile(r'(?:T\u1ed4NG C\u1ed8NG|T\u1ed5ng c\u1ed9ng|Total Amount|TOTAL|Sub Total)\s*:?\s*([\d.,]+)', re.I),
]


def extract_header(text: str) -> dict:
    """Extract header fields tu text"""
    flat = normalize_one_line(text)
    
    ma_po = None
    for p in MA_PO_PATTERNS:
        ma_po = first_match(flat, p)
        if ma_po:
            break
    
    ngay_dat = None
    for p in NGAY_DAT_PATTERNS:
        val = first_match(flat, p)
        if val:
            ngay_dat = normalize_date(val)
            break
    
    ngay_giao = None
    for p in NGAY_GIAO_PATTERNS:
        val = first_match(flat, p)
        if val:
            ngay_giao = normalize_date(val)
            break
    
    tong_tien = None
    for p in TONG_TIEN_PATTERNS:
        val = first_match(flat, p)
        if val:
            tong_tien = parse_number(val)
            break
    
    return {
        "order_number": ma_po,
        "order_date": ngay_dat,
        "delivery_date": ngay_giao,
        "total_amount": tong_tien,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# ITEM RULES - Trích xuất dòng sản phẩm
# Focus: tên SP, ĐVT, số lượng, thành tiền, (thuế nếu có)
# ═══════════════════════════════════════════════════════════════════════════════

ITEM_PATTERNS = [
    # Kingfood: STT + Barcode + Desc + Unit + Qty + PackSize + CaseQty + ... + Prices
    {
        "name": "Kingfood",
        "pattern": re.compile(
            r'(\d+)\s+((?:1)?893\d{9,10})\s+(.+?)\s+(CHAI|THUNG|THÙNG|LON|CAI|HOP|HỘP)\s+([\d.,]+)\s+(\d+)\s+([\d.,]+)\s+Th\u00f9ng\s+([\d.,]+)\s+[\d%]+\s+[\d%]+\s+[\d%]+\s+([\d.,]+)\s+(\d+)%\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)',
            re.I
        ),
        "extract": lambda m: {
            "product_code": m.group(2).lstrip('1'),
            "product_name": m.group(3).strip(),
            "unit": m.group(4),
            "quantity": parse_number(m.group(5)),
            "unit_price": parse_number(m.group(9)),
            "line_total": parse_number(m.group(12)),
            "tax_rate": parse_number(m.group(10)),
        }
    },
    # Standard: STT + Barcode + Desc + Unit + Qty + UnitPrice + Total
    {
        "name": "Standard_Barcode",
        "pattern": re.compile(
            r'(\d+)\s+(893\d{10})\s+(.+?)\s+(Chai|CHAI|Th\u00f9ng|THÙNG|LON|Lon|CAI|Cai)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)',
            re.I
        ),
        "extract": lambda m: {
            "product_code": m.group(2),
            "product_name": m.group(3).strip(),
            "unit": m.group(4),
            "quantity": parse_number(m.group(5)),
            "unit_price": parse_number(m.group(6)),
            "line_total": parse_number(m.group(7)),
            "tax_rate": None,
        }
    },
    # Mega Market: STT + Barcode + Desc + MaSP + SoLuong + DonGia + ThanhTien
    {
        "name": "MegaMarket",
        "pattern": re.compile(
            r'(\d+)\s+(\d{13})\s+(.+?)\s+(\d{4,6})\s+(\d+)\s+([\d.,]+)\s+([\d.,]+)',
            re.I
        ),
        "extract": lambda m: {
            "product_code": m.group(2),
            "product_name": m.group(3).strip(),
            "unit": None,
            "quantity": parse_number(m.group(5)),
            "unit_price": parse_number(m.group(6)),
            "line_total": parse_number(m.group(7)),
            "tax_rate": None,
        }
    },
]


def extract_items(text: str) -> list[dict]:
    """Extract items tu text"""
    flat = normalize_one_line(text)
    items = []
    seen = set()
    
    for rule in ITEM_PATTERNS:
        for m in rule["pattern"].finditer(flat):
            try:
                item = rule["extract"](m)
                if not item or not item.get("product_name"):
                    continue
                
                # Auto-calculate
                if not item.get("line_total") and item.get("unit_price") and item.get("quantity"):
                    item["line_total"] = item["unit_price"] * item["quantity"]
                if not item.get("unit_price") and item.get("line_total") and item.get("quantity"):
                    item["unit_price"] = item["line_total"] / item["quantity"]
                
                # Dedup
                key = f"{item.get('product_code', '')}|{item['product_name']}|{item.get('quantity', '')}"
                if key in seen:
                    continue
                seen.add(key)
                items.append(item)
            except Exception:
                continue
    
    return items


def extract_from_text(text: str) -> dict:
    """
    Main entry: extract header + items tu raw text.
    Tra ve dict tuong thich voi Gemini output format.
    """
    header = extract_header(text)
    items = extract_items(text)
    
    return {
        "order_number": header["order_number"],
        "order_date": header["order_date"],
        "delivery_date": header["delivery_date"],
        "total_amount": header["total_amount"],
        "items": items,
        "_extraction_method": "rule-based",
    }
