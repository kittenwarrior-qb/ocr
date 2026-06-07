"""
Parse Excel purchase order files into extracted-data structure matching OCR output.

Supports:
1. Satori internal template (ĐƠN ĐẶT HÀNG kênh GT) — fixed layout
2. KingKong/generic purchase order Excel — auto-detect
"""
import re
from pathlib import Path
import unicodedata


def _clean_num(val) -> float:
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


def _norm(val) -> str:
    text = _str(val).lower()
    text = unicodedata.normalize("NFD", text)
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    text = text.replace("đ", "d")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _parse_date(val) -> str | None:
    if not val:
        return None
    s = _str(val)
    m = re.search(r'(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})', s)
    if m:
        d, mo, y = m.group(1), m.group(2), m.group(3)
        return f"{y}-{mo.zfill(2)}-{d.zfill(2)}"
    return None


def _is_satori_template(rows: list) -> bool:
    """Detect Satori internal order template by checking header structure."""
    normalized = _norm(' '.join(
        _str(c) for row in rows[:25] for c in row if c is not None
    ))
    return (
        'satori' in normalized and
        'don dat hang' in normalized and
        'ben mua' in normalized and
        'stt' in normalized and
        ('ten hang' in normalized or 'ten hang hoa' in normalized) and
        ('so luong' in normalized or 'luong hang dat' in normalized)
    )


def _parse_satori_template(ws) -> dict:
    """
    Parse Satori fixed-format order template.
    Columns (0-indexed row values):
      0=CK_group, 1=STT, 2=product_name, 3=spec, 4=uom,
      5=qty_ordered, 6=qty_promo, 7=qty_total,
      8=unit_price, 9=line_total_pretax,
      10=tax_rate, 11=tax_amount, 12=line_total_with_tax
    Header:
      R12: Bên mua / MST
      R13: Người liên hệ / Điện thoại
      R14: Địa chỉ giao dịch
      R15: Địa chỉ giao hàng
    Data rows: after header row containing 'STT' and 'Số lượng'
    """
    rows = list(ws.iter_rows(values_only=True))
    result = {
        "document_type": "purchase_order",
        "customer_name": None,
        "customer_tax_code": None,
        "order_number": None,
        "order_date": None,
        "recipient_name": None,
        "delivery_address": None,
        "items": [],
        "total_amount": None,
        "tax_amount": None,
    }

    # ── Header metadata ────────────────────────────────────────────────────────
    for row in rows[:20]:
        flat = ' '.join(_str(c) for c in row if c is not None)
        vals = [_str(c) for c in row]

        label = (vals[1] if len(vals) > 1 else '').lower()
        value = vals[3] if len(vals) > 3 else ''
        right_label = (vals[8] if len(vals) > 8 else '').lower()
        right_value = vals[9] if len(vals) > 9 else ''

        if 'bên mua' in label and value and not result['customer_name']:
            result['customer_name'] = value
        if 'mst' in right_label and right_value and not result['customer_tax_code']:
            m = re.search(r'\d{10,13}', right_value)
            result['customer_tax_code'] = m.group(0) if m else right_value
        if 'người liên hệ' in label and value and not result['recipient_name']:
            result['recipient_name'] = value
        if 'địa chỉ giao hàng' in label and value and not result['delivery_address']:
            result['delivery_address'] = value
        elif 'địa chỉ giao dịch' in label and value and not result['delivery_address']:
            result['delivery_address'] = value

        # Customer name: "Bên mua : <name>"
        m = re.search(r'Bên mua\s*:\s*(.+)', flat, re.I)
        if m and not result['customer_name']:
            name = m.group(1).strip()
            # Remove MST part if present
            name = re.sub(r'\s*MST\s*:.*', '', name).strip()
            if name:
                result['customer_name'] = name

        # Tax code: "MST : <code>"
        m = re.search(r'MST\s*:\s*(\d{10,13})', flat, re.I)
        if m and not result['customer_tax_code']:
            result['customer_tax_code'] = m.group(1).strip()

        # Contact: "Người liên hệ : <name>"
        m = re.search(r'Người liên hệ\s*:\s*([^Đ][^\t\n]+)', flat, re.I)
        if m and not result['recipient_name']:
            result['recipient_name'] = m.group(1).strip().split('\t')[0].strip()

        # Delivery address
        m = re.search(r'Địa chỉ giao hàng\s*:\s*(.+)', flat, re.I)
        if m and not result['delivery_address']:
            result['delivery_address'] = m.group(1).strip()
        elif not result['delivery_address']:
            m = re.search(r'Địa chỉ giao dịch\s*:\s*(.+)', flat, re.I)
            if m:
                result['delivery_address'] = m.group(1).strip()

    # ── Find data rows: after row with 'STT' and 'Số lượng' ──────────────────
    data_start = None
    for idx, row in enumerate(rows):
        normalized = _norm(' '.join(_str(c) for c in row if c is not None))
        if 'stt' in normalized and ('so luong' in normalized or 'luong' in normalized) and ('ten hang' in normalized or 'ten hang hoa' in normalized):
            data_start = idx + 2  # skip header + col number row
            break
        flat = ' '.join(_str(c) for c in row if c is not None).lower()
        if 'stt' in flat and ('số lượng' in flat or 'lượng') and 'tên hàng' in flat:
            data_start = idx + 2  # skip header + col number row
            break

    if data_start is None:
        return result

    # ── Extract items with quantity > 0 ──────────────────────────────────────
    for row in rows[data_start:]:
        vals = list(row)
        if not any(v is not None for v in vals):
            continue

        # Check if this is a valid product row (col 1 = sequential number)
        stt_val = _str(vals[1] if len(vals) > 1 else '')
        try:
            stt = int(float(stt_val))
        except (ValueError, TypeError):
            # Might be total row — capture total
            flat = ' '.join(_str(v) for v in vals if v is not None).lower()
            if 'tổng tiền' in flat and len(vals) > 12:
                total = _clean_num(vals[12] if len(vals) > 12 else None)
                if total > 0:
                    result['total_amount'] = total
            continue

        product_name = _str(vals[2] if len(vals) > 2 else '')
        if not product_name:
            continue

        uom = _str(vals[4] if len(vals) > 4 else '')
        qty_ordered = _clean_num(vals[5] if len(vals) > 5 else None)
        unit_price = _clean_num(vals[8] if len(vals) > 8 else None)
        line_total_pretax = _clean_num(vals[9] if len(vals) > 9 else None)
        tax_rate_raw = _clean_num(vals[10] if len(vals) > 10 else None)
        line_total_withtax = _clean_num(vals[12] if len(vals) > 12 else None)

        # Only include rows where quantity was filled in (> 0)
        if qty_ordered <= 0:
            continue

        # Tax rate: stored as 0.08 → convert to 8
        tax_rate = tax_rate_raw * 100 if tax_rate_raw < 1 else tax_rate_raw

        result['items'].append({
            "product_name": product_name,
            "product_code": "",
            "quantity": qty_ordered,
            "uom": uom,
            "unit_price": unit_price if unit_price > 0 else None,
            "line_total": line_total_pretax if line_total_pretax > 0 else None,
            "tax_rate": tax_rate,
        })

    # Không tự tính total_amount nếu file không in sẵn — số tự tính có thể sai
    # (thiếu dòng khuyến mãi/chiết khấu không tính thuế, v.v.). Giữ null để user
    # biết cần kiểm tra lại file gốc thay vì tin vào một con số suy diễn.

    return result


def _parse_generic(ws) -> dict:
    """Generic parser for other Excel PO formats (KingKong, etc.)."""
    rows = list(ws.iter_rows(values_only=True))
    result = {
        "document_type": "purchase_order",
        "customer_name": None, "customer_tax_code": None,
        "order_number": None, "order_date": None,
        "delivery_address": None, "recipient_name": None,
        "items": [], "total_amount": None, "tax_amount": None,
    }

    # Metadata pass
    for row in rows:
        flat = ' '.join(_str(c) for c in row if c is not None)
        m = re.search(r'(?:Mã phiếu|Số đơn|PO|Order)[:\s]+([A-Z0-9\-_/]+)', flat, re.I)
        if m and not result['order_number']:
            result['order_number'] = m.group(1).strip()
        m = re.search(r'(?:Ngày|Date)[:\s]+(\d{1,2}[/\-]\d{1,2}[/\-]\d{4})', flat, re.I)
        if m and not result['order_date']:
            result['order_date'] = _parse_date(m.group(1))
        m = re.search(r'MST[:\s]+(\d{10,13})', flat, re.I)
        if m and not result['customer_tax_code']:
            result['customer_tax_code'] = m.group(1).strip()
        # Customer name
        for cell in row:
            s = _str(cell)
            if re.search(r'CÔNG TY|TNHH|MART|STORE|CO\.,', s, re.I) and len(s) > 5:
                if not result['customer_name']:
                    result['customer_name'] = s
                    break
        # Delivery address
        for i, cell in enumerate(row):
            if re.search(r'Địa chỉ giao hàng|Địa chỉ kho nhận|Ship to', _str(cell), re.I):
                for j in range(i+1, len(row)):
                    v = _str(row[j])
                    if v and len(v) > 10:
                        result['delivery_address'] = v
                        break

    # Find header row
    header_idx = None
    col_map: dict = {}
    for idx, row in enumerate(rows):
        flat_lower = ' '.join(_str(c).lower() for c in row if c is not None)
        if ('sản phẩm' in flat_lower or 'tên hàng' in flat_lower) and \
           ('số lượng' in flat_lower or 'qty' in flat_lower or 'sl' in flat_lower):
            header_idx = idx
            for ci, cell in enumerate(row):
                s = _str(cell).lower().strip()
                if re.search(r'mã hàng|product.?code|barcode', s):
                    col_map['product_code'] = ci
                elif re.search(r'tên|sản phẩm|product.?name', s) and 'product_name' not in col_map:
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

    if header_idx is not None:
        for row in rows[header_idx + 1:]:
            flat = ' '.join(_str(c) for c in row if c is not None)
            if re.search(r'tổng tiền|tổng cộng|cần trả', flat, re.I):
                for cell in row:
                    n = _clean_num(cell)
                    if n > 100000 and not result['total_amount']:
                        result['total_amount'] = n
                continue
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
                idx2 = col_map.get(key)
                return row[idx2] if idx2 is not None and idx2 < len(row) else None

            qty = _clean_num(col_val('quantity'))
            if qty <= 0:
                continue

            unit_price = _clean_num(col_val('unit_price'))
            line_total = _clean_num(col_val('line_total'))
            tax_rate_raw = _clean_num(col_val('tax_rate'))
            tax_rate = tax_rate_raw * 100 if tax_rate_raw < 1 else tax_rate_raw

            result['items'].append({
                "product_code": _str(col_val('product_code')),
                "product_name": _str(col_val('product_name')),
                "quantity": qty,
                "uom": _str(col_val('uom')),
                "unit_price": unit_price or None,
                "line_total": line_total or None,
                "tax_rate": tax_rate or None,
            })

    return result


def parse_excel_order(file_path: str) -> dict:
    """Parse a purchase order Excel file — auto-detect format."""
    import openpyxl
    wb = openpyxl.load_workbook(file_path, data_only=True)
    ws = wb.active

    rows = list(ws.iter_rows(min_row=1, max_row=min(ws.max_row, 25), values_only=True))
    if _is_satori_template(rows):
        return _parse_satori_template(ws)
    else:
        return _parse_generic(ws)
