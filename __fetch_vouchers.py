"""
Fetch vouchers from MISA internal API using browser credentials (token + cookies).
"""
import sys, io, json, re, warnings
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
warnings.filterwarnings("ignore")

import httpx

BASE = "https://amisapp.misa.vn/promotion/g2/api/business/Promotion"

TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJQYXlMb2FkRGF0YSI6IjkxcTFWOGx3UUt5ZHg2RmR3S0kyWERQRTJtWmdEdzdiM2VSL0YxVU5qTDNzaWxFTmhaTDlqWEpkbTR0bG9pT05rTzNRbFBRSEt1S3RSTmFDdzA2VVc3eHFNRlNPRGtzYW9kOVpGSmRkNVkyN1V6U0hneng0RmxjRjhiT2xsY3dBVDFTUHFCZnpoNVJEbjhEbVJ2L1FsNS8yMFRvRlU0OUpZS0NkUjhCN1R0UnkvY3lvV3hWKzJZVjkwM2NCcWNWcDV0YkZ1SjZTci9BLzhxaytNK21HSnBmS1ZuTkVDbk5uMU9hTXROcXJkdEZWeElhWUJrb0RqL29jQnBDNEIwelN0K1BFVEhaR25HeThxQXZlQWNoN2FKSUJBWGZoaTh2SFhLNTlmQVVLTE1hOHE1REVaMkNJNncxa1gvSXhCN2R4bzJUUlNtUzJlSXdVZnVvaTg1Z3JhK0hHNzFveGxDRUtab3dobmI1SlpnVGtzODlveTNnRUZLY25GWTZ6T0NFSzRSeGtLcHREOXJ2T0pDZ1dGQmNFcFVrMWRpa2Uzd09QOVk1R0pKaFVjR2laWmh0clRsZ0VxdDN0UU5wS014Yk1Ka2hLY3QwTE93ZG9KeDdGYUVPMG5yeENxU3ZPeGhNdnVYRUxrV0JyZGUxTmtOL05TVVk0MitwZTJublF2S25xVlpBVUxLbjF3Q0Q5LzJlcDN5L2xiSVAybHM1Zk1tSTZKLzVNNXpFY3N3NGY2Tk5IQ0FpZ2RiL3RwMkd6WG5HS3FqMG02NzNvNkRpd2Vxa0pzOVlQdEsvcmZ0NGFSZUlRS21LTFJCZHBQUG1FMzJMK3RvQjZsaUNkbnpSM0xEYndFdDdZTEdCT2R1cDBFUWtVVVdXSU1TLy9IWWZTaGdxOWVnVEF3Y1A1MXBrRnhobEpVcHhLREZMbnNWSm83L3pEcGhhMUx1YlJGclVXeXNWMGZOMDQxOWpnQWt1cTB6WTZrWDl5QVNLbTVyczh2dStmWHRyNlBicnErNVlTZEJVU3hVY2FwY1ZDZ2N1Mi9uQ1FJdmJIQlJPS0pXNHNkcmk1eDRtY3RjYTczMlgrV1REUkpmcWNKZzBuNjNjQkNJZmJiM29teS9hQkhvSXhyOWp1dUtMcEl2VTdLaHpRV0lOUUl2UW9lc3VPcnpTNEFqMWY0UXFPb1dSZWVBUGxtelVHd0REQ1Z3NGlCQTZMQ3Y1VHdMZm4yWjFXNXdhOEt0M3pmMEtWV1VXVWozcXVtMXZxS3FUT09tR1BVUXZyb3ZWZ3VDWXlIbjc1MDNBMGNHd05WcU5uYXErM3VFZGczYWUrYTh1SG1CalNHYkF5akJYVHhKa0l3ZzZqRkcyQzlydnY1L3JaTUNWU3Z0UEVFMGwvZFg0V2t5Z1ZTdXdDc0JHMkFqa3p5M0tEbVJycVFSUTNDTXl6V0VEa2tDWDA3UDVJUTVnK1d2T1JUQ2prejJUUHBrT0ZWa29zV1E5MkZnejlhdGpVT1FjcUd5SEpGMElIOFdxS2pNT3hFS25jQ2RDS1hZVFVpUjVqUTFFWXpTT0EvRVVYU1VjakVsSE5MU25Sc2VzNEhEbDZpOUp6MWFpK25kOUFFMDU4VDdidmVxU3RGbi80ODFNQW5neXZMZlcxbkFUYkVWT1hsd1FsME51OXd6Q2JsbU5TZ1AzTjRoenkxR0dDUzVReGoxaGNoZTBtcG4zNW4ycVUvN1FkczBTdFF3eWkxWFliTU1sNzNXSFowWU82aCtqRXNDTU9aRmFhaHJxMFo1cERWSGFZcDFpbnl2VUZ5MGo1dmp0ZzU0QThKK1ZIODNyUXpvRnkrR2o5V2hVVTJNVHJUVUZJTEdJUVdFUys3UGlRdXBvMldxV2JpZnJzVnZ1dDdhMGI3bVBrcWxVSFlzSjU5a3Z4UWg0N1hoeXN3ZEZESlJOVVdDQTU3K1NFNVN3UFduanpIZkttV1YyY0s0TTlTTjBPTlhlN0tNR2pRWVpkcHIwdHQzNitVdDBwb2djemU0TVFnNzJ2OStkelZReG9JdndoWUo3T3dKVzlKTVZxOWN0dUU1aGNHSHdNMStyZlJmUktNVnBQMjhRaHRmVy9zdFBabkhKU0JqdXZIZHBwSHZ2Y1RocnFZaUx2UXpRMHFtSGQvbVhrZWJYSjVPT09XWldNbUxDQUFiQ2lmN2FycFVwb2p5Y1lWVG8yS2VxaVFjdyt2OElsWnRkN2I3a3ZBZDdqSGd4bVZJYnJVNHhrTFpJY1E1aUJ4NWdZenl5NzkwcTB3SjJqQThFRHpRcFlyNUo5cURNWHk3ejNKMjRxcjJBOGIzMEVIQzVtdVdTWlcvM3J4Nm1INVovZmcvVTlLcU1SVTBMU3ZyK0hsQXAwMnM0SVFQWFhRVitUWEdDY25UZjJkc2N3dUxuU0U1RkRzMktyVXlpSXBLSjVvbzA0NEJxdStDbUI0dS9WOXVhZ3ZTWHdlNVA0YzdrQmtvRXUwYzQxbWUxVkk3b3FPY01rSUo2TENnMUZwNnpCVkhMNFFBdGxPZ3pTYTVjYUpjQVhnZVRzYW9CaUZtZk5jNTdpdlUzblJXbGNUVjdVTzJSUmRuQmVadXJNZ0hITnlhcEpiUmNQdXNxV2F4bHJVMXkrQXRsN0E3VE1ub0hvTGxjeEF0cVZGMGkxSzAvcm42dWJDREd5OXhLN1dacWJ4ZTVkY0RYVUtHQWQwMEJtSGVMbzk0YlFxTU1ReXF5SHFTeXVoR1N1V0p5WnlBMDVVN21PR3RzVHhGN29JRFEyd0tLckIwQ3hnSFAvNVE2UmM5VEEwOVNES0lkMmJPRGVRZWF4bEJBcktZYnBtMHFHUGZhNFZzYTkrV1MyVzRmWDVMVmdILzN5R0F5T1lWQ3luZ1FQMEFnbWd0V1ZTU3JGeEo0Nm1kRjdDK2NCZDBGaUhnTkgxTmMyd0F5c0NOc2pDUHRyMUNDUDRBMmFIcTBGaVVhUjhnNzA1dE1PMk12R3MzOHR2M1JWdzRDNEk0S3BSOE95NUI1b1NkL1U2Q016cS9tbmgzSjRPeVlieVVBSFhTRjRrYk5HUkpCTlpOYWIvTVBvTmtBazR6Nkp1ZjBScW0rNnBsNTdSWmtsbnJxeTZzT0hTYzA0dE5EdW9HT2MxNVFFOStyZ0Nubm80WlZmZ3R4RmtEZU5BRmRaVE9EMzFhb2NIalVyNU9XT3RVZEJYWXMrN2dnNWs2eWpnK24vRGhvMDRYM1pWbWhMbXo2ZTdtVHF3TWgyWDZYaWFCYXhPellzbFBvb0RzWEp5RncvMEp1WHM1alUwUTRRUFZuNngrbStXTkI2aTQ3RVRTRXQ3SEpETFdoWDRIcjRvRDYya3JHRnFNN1FVWDh6Z1JrMVk0TDFQZ1k5IiwiZXhwIjoxNzgwNzE2NDczLCJpc3MiOiJNSVNBIiwiYXVkIjoiUFJPTU9USU9OIn0.L2aAZVnxI1JBgHDVRoeE4ja3KewgUzNi7868Vdwh-is"

COOKIES = "CompanyCode=55ksn4bu; x-culture=vi; x-deviceid=4b167208-a5a1-43b8-8ba9-c7141880434f; x-sessionid=9244cd92adfb4067a487aa6f93d0a23881df9e76b6c1489d9cade4f1e080edf7; x-tenantsource=FromTenantRequest; x-tenantid=9244cd92-adfb-4067-a487-aa6f93d0a238; x-login-from=basic"

HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "X-MISA-Language": "vi-VN",
    "companycode": "55ksn4bu",
    "layoutcode": "promotion",
    "Content-Type": "application/json",
    "Accept": "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": "https://amisapp.misa.vn/promotion/promotion/list",
    "Cookie": COOKIES,
    "crm2-aspxauth": "undefined",
}

GRID_BODY = {
    "Columns": "SUQsUHJvbW90aW9uQ29kZSxQcm9tb3Rpb25OYW1lLFN0YXJ0RGF0ZSxFbmREYXRlLFByb21vdGlvblR5cGVJRCxQcm9tb3Rpb25UeXBlSURUZXh0LE9iamVjdElELE9iamVjdElEVGV4dCxJc0FjdGl2ZSxGb3JtTGF5b3V0SUQsQWNjb3VudFR5cGVJRCxBY2NvdW50VHlwZUlEVGV4dCxBY2NvdW50SUQsQWNjb3VudElEVGV4dCxJc0V4cG9uZW50aWFsLENvbmN1cnJlbmNlQXBwbHlUeXBlLENvbmN1cnJlbmNlQXBwbHlUeXBlVGV4dCxCYXNlZE9uSUQsQmFzZWRPbklEVGV4dCxJc0FwcGx5T25lLERlc2NyaXB0aW9u",
    "CustomColumns": "Q3VzdG9tSUQ=",
    "Sorts": [], "Start": 0, "Page": 1, "PageSize": 50,
    "Filters": [{"Value": "0", "Addition": 2, "Operator": 11, "Property": "IsAccumulation",
                 "FieldType": 0, "InputType": 17, "IsCustomField": False,
                 "IsFromFormula": False, "ModuleRelated": "", "IsRelatedField": False,
                 "IsDefaultFilter": False, "FromFilterCustom": False}],
    "LayoutCode": "Promotion",
    "DefaultTotal": False, "IsMappingData": False, "IsMappingDataWithCustom": False,
    "IsApproved": False, "CustomPagingData": {}, "IsUsedELTS": True,
    "ListGmailPage": [], "ListFacebookPage": {}, "IsGetCache": True, "IsCheckInactive": False,
}


def req(method, url, **kw):
    with httpx.Client(timeout=30, verify=False) as c:
        r = getattr(c, method)(url, headers=HEADERS, **kw)
        try:
            data = r.json()
        except Exception:
            data = {"_raw": r.text}
        return r.status_code, data


def parse_product(text):
    m = re.match(r'^([\w\-\.]+)\s*-\s*(.+)', (text or '').strip())
    return (m.group(1).strip(), m.group(2).strip()) if m else ((text or '').strip(), '')


def convert(promo, items):
    account_text = promo.get("AccountIDText") or ""
    customers = [c.strip() for c in account_text.split(",") if c.strip()]
    v = {
        "code": (promo.get("PromotionCode") or "").strip(),
        "name": (promo.get("PromotionName") or "").strip(),
        "type": promo.get("PromotionTypeIDText") or "",
        "target": promo.get("ObjectIDText") or "",
        "customer_type": promo.get("AccountTypeIDText") or "",
        "customers": customers,
        "description": promo.get("Description") or "",
        "from_date": (promo.get("StartDate") or "")[:10] or None,
        "to_date": (promo.get("EndDate") or "")[:10] or None,
        "is_active": bool(promo.get("IsActive", True)),
        "apply_with_others": promo.get("ConcurrenceApplyTypeText") or "",
        "multiplier": bool(promo.get("IsExponential", False)),
        "accumulate": bool(promo.get("IsAccumulation", False)),
        "base_on": "Theo hàng hóa",
        "apply_once": bool(promo.get("IsApplyOne", False)),
        "uom_type": "Đơn vị tính chính",
        "unit_price_type": promo.get("BasedOnIDText"),
        "items": [],
    }
    for item in items:
        b_code, b_name = parse_product(item.get("BoughtProductIDText", ""))
        uom = item.get("ProductUnitIDText") or "Thùng"
        qty = int(item.get("Quantity") or 0)
        max_ord = int(item.get("MaxQuantity") or 0)
        max_cust = int(item.get("MaxQuantityAccount") or 0)
        max_prog = int(item.get("MaxQuantityProgram") or 0)
        gifts = item.get("OfferProductIDDataSelected") or []
        if gifts:
            for g in gifts:
                v["items"].append({
                    "product_code": b_code, "product_name": b_name, "uom": uom, "quantity": qty,
                    "gift_product_code": g.get("ProductIDText") or "",
                    "gift_product_name": g.get("ProductName") or "",
                    "gift_quantity": int(g.get("Amount") or 1),
                    "gift_uom": g.get("UnitIDText") or uom,
                    "max_per_order": max_ord, "max_per_customer": max_cust, "max_total": max_prog,
                })
        else:
            md = item.get("MoneyDiscount"); pd = item.get("PercentDiscount")
            if md or pd:
                v["items"].append({
                    "product_code": b_code, "product_name": b_name, "uom": uom, "quantity": qty,
                    "discount_money": float(md or 0), "discount_percent": float(pd or 0),
                    "max_per_order": max_ord, "max_per_customer": max_cust, "max_total": max_prog,
                })
    return v


def main():
    print("Fetching promotion list...")
    status, resp = req("post", f"{BASE}/Grid", json=GRID_BODY)
    print(f"Grid status: {status}")

    if not resp.get("Data") and not resp.get("data"):
        print("ERROR:", resp)
        return

    promos = resp.get("Data") or resp.get("data") or []
    print(f"Found {len(promos)} promotions")

    result = []
    for p in promos:
        code = p.get("PromotionCode", "")
        pid = p.get("ID")
        print(f"  {code} (ID={pid})...", end=" ", flush=True)
        status2, items_resp = req("get", f"{BASE}/PromoInfo/{pid}")
        items = items_resp.get("Data") or []
        print(f"status={status2} {len(items)} items")
        result.append(convert(p, items))

    out = "/app/data/vouchers.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"\nWrote {len(result)} vouchers to {out}")
    for v in result:
        s = "✓" if v["is_active"] else "✗"
        print(f"  {s} {v['code']}: {len(v['items'])} items")


main()
