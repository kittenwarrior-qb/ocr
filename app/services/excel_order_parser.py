"""
Parse Excel purchase order files into the same extracted-data structure as OCR.
Supports KingKong-style phiếu đặt nhập hàng and similar formats.
"""
import re
from decimal import Decimal, InvalidOperation
from pathlib import Path


def _clean_num(val) -> float:
    """Convert cell value to float, handling Vietnamese number format."""
    if val is None:
        return 0.0
    s = str(val).replace(',', '').replace(' ', '').strip()
    try:
        return float(s)
    except (ValueError, TypeError):
        return 0.0


def _str(val) -> str:
    if val is None:
        return ''
    return str(val).strip()


def _parse_date(val) -> str | None:
    if not val:
        return None
    s = _str(val)
    # "18/05/2026 13:39" or "18/05/2026"
    m = re.search(r'(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})', s)
    if m:
        d, mo, y = m.group(1), m.group(2), m.group(3)
        return f"{y}-{mo.zfill(2)}-{d.zfill(2)}"
    return None


def _rows_to_flat(ws) -> list[list]:
    """Get all non-empty rows as list of cell values."""
    rows = []
    for row in ws.iter_rows(values_only=True):
        rows.append([v for v in row])
    return rows


def parse_excel_order(file_path: str) -> dict:
    """
    Parse a purchase order Excel file.
    Returns extracted data dict matching OCR output structure.
    """
    import openpyxl
    wb = openpyxl.load_workbook(file_path, data_only=True)
    ws = wb.active

    rows = _rows_to_flat(ws)
    result = {
        "document_type": "purchase_order",
        "customer_name": None,
        "customer_tax_code": None,
        "order_number": None,
        "order_date": None,
        "delivery_address": None,
        "recipient_name": None,
        "items": [],
        "total_amount": None,
        "tax_amount": None,
    }

    # ── Pass 1: extract header metadata ─────────────────────────────────────
    for row in rows:
        flat = ' '.join(_str(c) for c in row if c is not None)

        # Company name (often in first few rows standalone)
        if not result['customer_name']:
            for cell in row:
                s = _str(cell)
                if re.search(r'CÔNG TY|TNHH|CỬA HÀNG|SIÊU THỊ|MART|STORE', s, re.I) and len(s) > 5:
                    result['customer_name'] = s
                    break

        # PO number — "Mã phiếu: OT..." or "Số đơn: ..."
        m = re.search(r'(?:Mã phiếu|Số đơn|PO|Order)[:\s]+([A-Z0-9\-_/]+)', flat, re.I)
        if m and not result['order_number']:
            result['order_number'] = m.group(1).strip()

        # Date
        m = re.search(r'(?:Ngày|Date)[:\s]+(\d{1,2}[/\-]\d{1,2}[/\-]\d{4})', flat, re.I)
        if m and not result['order_date']:
            result['order_date'] = _parse_date(m.group(1))

        # Tax code
        m = re.search(r'MST[:\s]+(\d{10,13})', flat, re.I)
        if m and not result['customer_tax_code']:
            result['customer_tax_code'] = m.group(1).strip()

        # Invoice company (more reliable customer name)
        m = re.search(r'(?:Thông tin xuất hóa đơn|Tên công ty|Invoice)[:\s]*$', flat, re.I)
        if m:
            # Next non-empty cell value in same or next row
            for cell in row:
                s = _str(cell)
                if re.search(r'CÔNG TY|TNHH|CỬA HÀNG|SIÊU THỊ|MART|CO\.,', s, re.I) and len(s) > 5:
                    result['customer_name'] = s
                    break
        # Also grab company name from the value column next to label
        for i, cell in enumerate(row):
            s = _str(cell)
            if re.search(r'(?:Thông tin xuất hóa đơn|Tên công ty)', s, re.I):
                for j in range(i+1, len(row)):
                    v = _str(row[j])
                    if v and re.search(r'CÔNG TY|TNHH|MART|CO\.,', v, re.I):
                        result['customer_name'] = v
                        break

        # Delivery address
        for i, cell in enumerate(row):
            s = _str(cell)
            if re.search(r'(?:Địa chỉ kho nhận|Địa chỉ giao|Địa chỉ|Address)\s*$', s, re.I):
                for j in range(i+1, len(row)):
                    v = _str(row[j])
                    if v and len(v) > 10 and not re.search(r'ĐT:|Tel:|Email:', v, re.I):
                        result['delivery_address'] = v
                        break

    # ── Pass 2: find items table ─────────────────────────────────────────────
    header_row_idx = None
    col_map = {}  # column name → column index

    for idx, row in enumerate(rows):
        flat_lower = ' '.join(_str(c).lower() for c in row if c is not None)
        if ('stt' in flat_lower or 'sản phẩm' in flat_lower or 'product' in flat_lower.lower()) \
           and ('số lượng' in flat_lower or 'quantity' in flat_lower or 'sl' in flat_lower):
            header_row_idx = idx
            # Map columns
            for ci, cell in enumerate(row):
                s = _str(cell).lower().strip()
                if re.search(r'mã hàng|product.?code|item.?code|barcode', s):
                    col_map['product_code'] = ci
                elif re.search(r'tên|sản phẩm|product.?name|description|diễn giải', s):
                    if 'product_name' not in col_map:
                        col_map['product_name'] = ci
                elif re.search(r'số lượng|sl|qty|quantity', s):
                    col_map['quantity'] = ci
                elif re.search(r'đvt|đơn vị|unit', s):
                    col_map['uom'] = ci
                elif re.search(r'đơn giá|unit.?price|price', s):
                    col_map['unit_price'] = ci
                elif re.search(r'thuế suất|vat.*%|tax.*rate|%', s):
                    col_map['tax_rate'] = ci
                elif re.search(r'thành tiền|total|amount', s) and 'line_total' not in col_map:
                    col_map['line_total'] = ci
            break

    # ── Pass 3: extract items ────────────────────────────────────────────────
    if header_row_idx is not None:
        for row in rows[header_row_idx + 1:]:
            # Stop at summary/total rows
            flat = ' '.join(_str(c) for c in row if c is not None)
            if re.search(r'thuế suất|tổng tiền|cần trả|giảm giá|tổng cộng|total', flat, re.I):
                # Capture total if present
                for cell in row:
                    n = _clean_num(cell)
                    if n > 100000 and not result['total_amount']:
                        result['total_amount'] = n
                continue

            # Must have a sequential number in first real column (1.0, 2.0, ...)
            first_vals = [_str(c) for c in row if c is not None]
            if not first_vals:
                continue

            # Check if first numeric cell looks like a row index
            row_num = None
            for cell in row[:3]:
                try:
                    n = float(_str(cell))
                    if 0 < n <= 9999:
                        row_num = n
                        break
                except (ValueError, TypeError):
                    pass
            if row_num is None:
                continue

            def col_val(key):
                idx = col_map.get(key)
                return row[idx] if idx is not None and idx < len(row) else None

            product_code = _str(col_val('product_code'))
            product_name = _str(col_val('product_name'))
            qty = _clean_num(col_val('quantity'))
            uom = _str(col_val('uom'))
            unit_price = _clean_num(col_val('unit_price'))
            tax_rate = _clean_num(col_val('tax_rate'))
            line_total = _clean_num(col_val('line_total'))

            if not product_name and not qty:
                continue

            # Compute line total if missing
            if not line_total and unit_price and qty:
                line_total = unit_price * qty

            result['items'].append({
                "product_code": product_code,
                "product_name": product_name,
                "quantity": qty,
                "uom": uom,
                "unit_price": unit_price,
                "tax_rate": tax_rate,
                "line_total": line_total,
            })

    # Compute total from items if not found
    if not result['total_amount'] and result['items']:
        subtotal = sum(i['line_total'] for i in result['items'])
        tax = sum(i['line_total'] * i['tax_rate'] / 100 for i in result['items'])
        result['total_amount'] = subtotal + tax
        result['tax_amount'] = tax

    return result
