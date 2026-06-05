import sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from app.services.excel_order_parser import parse_excel_order

for fname in [
    'ĐƠN ĐẶT HÀNG - KÊNH GT - ĐẠI LÝ - MIỀN NAM (bs Satori 5 lít & Hiakari 250ml).xlsx',
    'ĐƠN ĐẶT HÀNG - KÊNH GT - NHÀ PHÂN PHỐI - MIỀN NAM (bs Satori 5 lít & Hikari 250ml).xlsx',
]:
    print(f'\n=== {fname[:50]}... ===')
    r = parse_excel_order(fname)
    print(f'customer: {r["customer_name"]}')
    print(f'items with qty: {len(r["items"])}')
    if r["items"]:
        print('Sample items:', r["items"][:2])
    print(f'total: {r["total_amount"]}')
