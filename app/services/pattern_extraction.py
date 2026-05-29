"""Pattern-based extraction from PDF text — no AI, uses pdfplumber + regex."""
import logging
import re
from datetime import date
from pathlib import Path

logger = logging.getLogger(__name__)


def _extract_text_from_pdf(file_path: str) -> str:
    """Extract raw text from PDF using pdfplumber."""
    import pdfplumber

    path = Path(file_path)
    if path.suffix.lower() != ".pdf":
        return ""

    text_parts = []
    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)
    return "\n".join(text_parts)


def _extract_tables_from_pdf(file_path: str) -> list[list[list[str]]]:
    """Extract tables from PDF using pdfplumber."""
    import pdfplumber

    path = Path(file_path)
    if path.suffix.lower() != ".pdf":
        return []

    tables = []
    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            page_tables = page.extract_tables()
            if page_tables:
                tables.extend(page_tables)
    return tables


# ── Pattern rules for header fields ──────────────────────────────────────────

_PO_NUMBER_PATTERNS = [
    r"(?:S[oố]\s*PO|PO\s*No\.?|P/O\s*(?:Number|No\.?)|Order\s*No\.?|S[oố]\s*[Đđ][oơ]n\s*(?:h[aà]ng|[đd][aặ]t\s*h[aà]ng))\s*[:\-]?\s*([A-Za-z0-9\-_/]+)",
    r"(?:Supplier\s*Delivery\s*ID|Ord\s*slip\s*no)\s*[:\-]?\s*([A-Za-z0-9\-_/]+)",
]

_DATE_PATTERNS = [
    # DD/MM/YYYY or DD-MM-YYYY
    r"(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{4})",
    # YYYY-MM-DD
    r"(\d{4}[/\-]\d{1,2}[/\-]\d{1,2})",
]

_ORDER_DATE_LABELS = [
    r"(?:Ng[aà]y\s*[đd][aặ]t\s*h[aà]ng|Order\s*Date|PO\s*Date|Ng[aà]y\s*ch[uứ]ng\s*t[uừ]|DATE)\s*[:\-]?\s*",
]

_DELIVERY_DATE_LABELS = [
    r"(?:Ng[aà]y\s*giao\s*h[aà]ng|Delivery\s*Date|Ng[aà]y\s*nh[aậ]n\s*h[aà]ng|Expected\s*Delivery)\s*[:\-]?\s*",
]

_TOTAL_AMOUNT_PATTERNS = [
    r"(?:T[oổ]ng\s*c[oộ]ng|Total\s*Amount|Grand\s*Total|TOTAL)\s*[:\-]?\s*([\d\.,]+)",
]

_CUSTOMER_PATTERNS = [
    r"(?:K[ií]nh\s*g[uử]i|NHÀ CUNG CẤP|VENDOR|Supplier|Ordered\s*To)\s*[:\-]?\s*(.+)",
]


def _parse_date_str(s: str) -> str | None:
    """Try to parse a date string into YYYY-MM-DD."""
    s = s.strip()
    # DD/MM/YYYY
    m = re.match(r"(\d{1,2})[/\-\.](\d{1,2})[/\-\.](\d{4})", s)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if 1 <= d <= 31 and 1 <= mo <= 12:
            try:
                return date(y, mo, d).isoformat()
            except ValueError:
                pass
    # YYYY-MM-DD
    m = re.match(r"(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})", s)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            return date(y, mo, d).isoformat()
        except ValueError:
            pass
    return None


def _find_date_after_label(text: str, label_patterns: list[str]) -> str | None:
    """Find a date that appears after a label pattern."""
    for label_pat in label_patterns:
        for date_pat in _DATE_PATTERNS:
            combined = label_pat + date_pat
            m = re.search(combined, text, re.IGNORECASE)
            if m:
                date_str = m.group(1) if m.lastindex else m.group(0)
                parsed = _parse_date_str(date_str)
                if parsed:
                    return parsed
    return None


def _parse_number(s: str) -> float | None:
    """Parse a number string (with dots/commas as thousand separators)."""
    s = s.strip()
    # Remove thousand separators, keep decimal
    # Vietnamese: 1.234.567 or 1,234,567
    if "." in s and "," in s:
        # Determine which is decimal: last one
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        # Could be thousand sep or decimal
        parts = s.split(",")
        if len(parts[-1]) == 3:
            s = s.replace(",", "")
        else:
            s = s.replace(",", ".")
    elif "." in s:
        parts = s.split(".")
        if len(parts) > 2 or (len(parts) == 2 and len(parts[-1]) == 3):
            s = s.replace(".", "")
    try:
        return float(s)
    except ValueError:
        return None


# ── Table parsing ─────────────────────────────────────────────────────────────

_TABLE_HEADER_KEYWORDS = [
    "stt", "mã hàng", "ma hang", "tên hàng", "ten hang", "description",
    "article", "product", "item", "barcode", "plu", "sku",
]

_QTY_KEYWORDS = ["qty", "quantity", "số lượng", "so luong", "sl", "ord qty"]
_PRICE_KEYWORDS = ["price", "đơn giá", "don gia", "unit price", "pur. price", "buy cost"]
_TOTAL_KEYWORDS = ["total", "thành tiền", "thanh tien", "amount", "sub total"]
_UNIT_KEYWORDS = ["uom", "đvt", "dvt", "unit", "spec", "đơn vị"]
_NAME_KEYWORDS = ["description", "tên hàng", "ten hang", "article desc", "tên sản phẩm", "product"]
_CODE_KEYWORDS = ["item no", "item code", "mã hàng", "ma hang", "plu", "sku", "article", "prod cd"]


def _find_column_index(headers: list[str], keywords: list[str]) -> int | None:
    """Find column index matching any keyword."""
    for i, h in enumerate(headers):
        h_lower = h.lower().strip() if h else ""
        for kw in keywords:
            if kw in h_lower:
                return i
    return None


def _parse_items_from_tables(tables: list[list[list[str]]]) -> list[dict]:
    """Parse product items from extracted tables."""
    items = []

    for table in tables:
        if not table or len(table) < 2:
            continue

        # Find header row
        header_idx = None
        for i, row in enumerate(table):
            row_text = " ".join((c or "").lower() for c in row)
            if any(kw in row_text for kw in _TABLE_HEADER_KEYWORDS):
                header_idx = i
                break

        if header_idx is None:
            continue

        headers = [c or "" for c in table[header_idx]]

        # Find column indices
        name_col = _find_column_index(headers, _NAME_KEYWORDS)
        code_col = _find_column_index(headers, _CODE_KEYWORDS)
        qty_col = _find_column_index(headers, _QTY_KEYWORDS)
        price_col = _find_column_index(headers, _PRICE_KEYWORDS)
        total_col = _find_column_index(headers, _TOTAL_KEYWORDS)
        unit_col = _find_column_index(headers, _UNIT_KEYWORDS)

        # Parse data rows
        for row in table[header_idx + 1:]:
            if not row or all(not c for c in row):
                continue

            product_name = row[name_col].strip() if name_col is not None and name_col < len(row) and row[name_col] else None
            product_code = row[code_col].strip() if code_col is not None and code_col < len(row) and row[code_col] else None

            # Skip if no name and no code
            if not product_name and not product_code:
                continue

            quantity = None
            if qty_col is not None and qty_col < len(row) and row[qty_col]:
                quantity = _parse_number(row[qty_col])

            unit_price = None
            if price_col is not None and price_col < len(row) and row[price_col]:
                unit_price = _parse_number(row[price_col])

            line_total = None
            if total_col is not None and total_col < len(row) and row[total_col]:
                line_total = _parse_number(row[total_col])

            unit = None
            if unit_col is not None and unit_col < len(row) and row[unit_col]:
                unit = row[unit_col].strip()

            # Skip rows with no numeric data (likely sub-headers or notes)
            if quantity is None and unit_price is None and line_total is None:
                continue

            items.append({
                "product_code": product_code,
                "product_name": product_name or product_code or "Unknown",
                "quantity": quantity,
                "unit": unit,
                "unit_price": unit_price,
                "line_total": line_total,
                "discount_rate": None,
                "discount_amount": None,
                "tax_rate": None,
            })

    return items


# ── Main extraction function ──────────────────────────────────────────────────

def extract_by_pattern_rules(file_path: str) -> dict:
    """
    Extract document data using pdfplumber text extraction + regex pattern rules.
    No AI involved — lightweight and fast.
    """
    text = _extract_text_from_pdf(file_path)
    if not text:
        logger.warning(f"No text extracted from {file_path}")
        return {"items": [], "document_type": "purchase_order"}

    # Extract PO number
    order_number = None
    for pat in _PO_NUMBER_PATTERNS:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            order_number = m.group(1).strip()
            break

    # Extract dates
    order_date = _find_date_after_label(text, _ORDER_DATE_LABELS)
    delivery_date = _find_date_after_label(text, _DELIVERY_DATE_LABELS)

    # Extract total amount
    total_amount = None
    for pat in _TOTAL_AMOUNT_PATTERNS:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            total_amount = _parse_number(m.group(1))
            if total_amount:
                break

    # Extract customer/vendor name
    customer_name = None
    for pat in _CUSTOMER_PATTERNS:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            customer_name = m.group(1).strip()[:200]
            break

    # Extract items from tables
    tables = _extract_tables_from_pdf(file_path)
    items = _parse_items_from_tables(tables)

    result = {
        "document_type": "purchase_order",
        "order_number": order_number,
        "order_date": order_date,
        "delivery_date": delivery_date,
        "total_amount": total_amount,
        "customer_name": customer_name,
        "currency": "VND",
        "payment_method": None,
        "recipient_name": None,
        "description": None,
        "delivery_address": None,
        "discount_amount": None,
        "tax_amount": None,
        "items": items,
    }

    logger.info(
        f"Pattern extraction: PO={order_number}, date={order_date}, "
        f"delivery={delivery_date}, total={total_amount}, items={len(items)}"
    )
    return result
