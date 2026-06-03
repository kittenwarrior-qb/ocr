"""
Fetch promotion header data (code, name, dates) for all 13 promotions.
Uses FormConfigNew endpoint (same pattern as price books).
"""
import json, time, sys
import httpx

TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJQYXlMb2FkRGF0YSI6IjkxcTFWOGx3UUt5ZHg2RmR3S0kyWERQRTJtWmdEdzdiM2VSL0YxVU5qTDNzaWxFTmhaTDlqWEpkbTR0bG9pT05rTzNRbFBRSEt1S3RSTmFDdzA2VVc3eHFNRlNPRGtzYW9kOVpGSmRkNVkyN1V6U0hneng0RmxjRjhiT2xsY3dBVDFTUHFCZnpoNVJEbjhEbVJ2L1FsNS8yMFRvRlU0OUpZS0NkUjhCN1R0UnkvY3lvV3hWKzJZVjkwM2NCcWNWcDV0YkZ1SjZTci9BLzhxaytNK21HSnBmS1ZuTkVDbk5uMU9hTXROcXJkdEZWeElhWUJrb0RqL29jQnBDNEIwelN0K1BFVEhaR25HeThxQXZlQWNoN2FKSUJBWGZoaTh2SFhLNTlmQVVLTE1hOHE1REVaMkNJNncxa1gvSXhCN2R4bzJUUlNtUzJlSXdVZnVvaTg1Z3JhK0hHNzFveGxDRUtab3dobmI1SlpnVGtzODlveTNnRUZLY25GWTZ6T0NFSzRSeGtLcHREOXJ2T0pDZ1dGQmNFcFVrMWRpa2Uzd09QOVk5R0pKaFVjR2laWmh0clRsZ0VxdDN0UU5wS014Yk1Ka2hLY3QwTE93ZG9KeDdGYUVPMG5yeENxU3ZPeGhNdnVYRUxrV0JyZGUxTmtOL05TVVk0MitwZTJublF2S25xVlpBVUxLbjF3Q0Q5LzJlcDN5L2xiSVAybHM1Zk1tSTZKLzVNNXpFY3N3NGY2Tk5IQ0FpZ2RiL3RwMkd6WG5HS3FqMG02NzNvNkRpd2Vxa0pzOVlQdEsvcmZ0NGFSZUlRS21LTFJCZHBQUG1FMzJMK3RvQjZsaUNkbnpSM0xEYndFdDdZTEdCT2R1cDBFUWtVVVdXSU1TLy9IWWZTaGdxOWVnVEF3Y1A1MXBrRnhobEpVcHhLREZMbnNWSm83L3pEcGhhMUx1YlJGclVXeXNWMGZOMDQxOWpnQWt1cTB6WTZrWDl5QVNLbTVyczh2dStmWHRyNlBicnErNVlTZEJVU3hVY2FwY1ZDZ2N1Mi9uQ1FJdmJIQlJPS0pXNHNkcmk1eDRtY3RjYTczMlgrV1REUkpmcWNKZzBuNjNjQkNJZmJiM29teS9hQkhvSXhyOWp1dUtMcEl2VTdLaHpRV0lOUUl2UW9lc3VPcnpTNEFqMWY4UXFPb1dSZWVBUGxtelVHd0REQ1Z3NGlCQTZMQ3Y1VHdMZm4yWjFXNXdhOEt0M3pmMEtWV1VXVWozcXVtMXZxS3FUT09tR1BVUXZyb3ZWZ3VDWXlIbjc1MDNBMGNHd05WcU5uYXErM3VFZGczYWUrYTh1SG1CalNHYkF5akJYVHhKa0l3ZzZqRkcyQzlydnY1L3JaTUNWU3Z0UEVFMGwvZFg0V2t5Z1ZTdXdDc0JHMkFqa3p5M0tEbVJycVFSUTNDTXl6V0VEa2tDWDA3UDVJUTVnK1d2T1JUQ2prejJUUHBrT0ZWa29zV1E5MkZnejlhdGpVT1FjcUd5SEpGMElIOFdxS2pNT3hFS25jQ2RDS1hZVFVpUjVqUTFFWXpTT0EvRVVYU1VjakVsSE5MU25Sc2VzNEhEbDZpOUp6MWFpK25kOUFFMDU4VDdidmVxU3RGbi80ODFNQW5neXZMZlcxbkFUYkVWT1hsd1FsME51OXd6Q2JsbU5TZ1AzTjRoenkxR0dDUzVReGoxaGNoZTBtcG4zNW4ycVUvN1FkczBTdFF3eWkxWFliTU1sNzNXSFowWU82aCtqRXNDTU9aRmFhaHJxMFo1cERWSGFZcDFpbnl2VUZ5MGo1dmp0ZzU0QThKK1ZIODNyUXpvRnkrR2o5V2hVVTJNVHJUVUZJTEdJUVdFUys3UGlRdXBvMldxV2JpZnJzVnZ1dDdhMGI3bVBrcWxVSFlzSjU5a3Z4UWg4N1hoeXN3ZEZESlJOVVdDQTU3K1NFNVN3UFduanpIZkttV1YyY0s4TTlTTjBPTlhlN0tNR2pRWVpkcHIwdHQzNitVdDBwb2djemU0TVFnNzJ2OStkelZReG9JdndoWUo3T3dKVzlKTVZxOWN0dUU1aGNHSHdNMStyZlJmUktNVnBQMjhRaHRmVy9zdFBabkhKU0JqdXZIZHBwSHZ2Y1RocnFZaUx2UXpRMHFtSGQvbVhrZWJYSjVPT09XWldNbUxDQUFiQ2lmN2FycFVwb2p5Y1lWVG8yS2VxaVFjdyt2OElsWnRkN2I3a3ZBZDdqSGd4bVZJYnJVNHhrTFpJY1E1aUJ4NWdZenl5NzkwcTB3SjJqQThFRHpRcFlyNUo5cURNWHk3ejNKMjRxcjJBOGIzMEVIQzVtdVdTWlcvM3J4Nm1INVovZmcvVTlLcU1SVTBMU3ZyK0hsQXAwMnM4SVFQWFhRVitUWEdDY25UZjJkc2N3dUxuU0U1RkRzMktyVXlpSXBLSjVvbzA0NEJxdStDbUI0dS9WOXVhZ3ZTWHdlNVA0YzdrQmtvRXUwYzQxbWUxVkk3b3FPY01rSUo2TENnMUZwNnpCVkhMNFFBdGxPZ3pTYTVjYUpjQVhnZVRzYW9CaUZtZk5jNTdpdlUzblJXbGNUVjdVTzJSUmRuQmVadXJNZ0hITnlhcEpiUmNQdXNxV2F4bHJVMXkrQXRsN0E3VE1ub0hvTGxjeEF0cVZGMGkxSzAvcm42dWJDREd5OXhLN1dacWJ4ZTVkY0RYVUtHQWQwMEJtSGVMbzk0YlFxTU1ReXF5SHFTeXVoR1N1V0p5WnlBMDVVN21PR3RzVHhGN29JRFEyd0tLckIwQ3hnSFAvNVE2UmM5VEEwOVNES0lkMmJPRGVRZWF4bEJBcktZYnBtMHFHUGZhNFZzYTkrV1MyVzRmWDVMVmdILzN5R0F5T1lWQ3luZ1FQMEFnbWd0V1ZTU3JGeEo0Nm1kRjdDK2NCZDBGaUhnTkgxTmMyd0F5c0NOc2pDUHRyMUNDUDRBMmFIcTBGaVVhUjhnNzA1dE1PMk12R3MzOHR2M1JWdzRDNEk0S3BSOE95NUI1b1NkL1U2Q016cS9tbmgzSjRPeVlieVVBSFhTRjRrYk5HUkpCTlpOYWIvTVBvTmtBazR6Nkp1ZjBScW0rNnBsNTdSWmtsbnJxeTZzT0hTYzA0dE5EdW9HT2MxNVFFOStyZ0Nubm80WlZmZ3R4RmtEZU5BRmRaVE9EMzFhb2NIalVyNU9XT3RVZEJYWXMrN2dnNWs2eWpnK24vRGhvMDRYM1pWbWhMbXo2ZTdtVHF3TWgyWDZYaWFCYXhPellzbFBvb0RzWEp5RncvMEp1WHM1Z3MwZFliazVtN2ZoQ21JdVlvaHR3TnhOak0yOW5LcnBpSE8zQnhMa0hzVmphQUtOVks0WFNvdW1kRmJib0NvTUE9IiwiZXhwIjoxNzgwNTYyNDY4LCJpc3MiOiJNSVNBIiwiYXVkIjoiUFJPTU9USU9OIn0._n7BjgG0KCyEUYNWo8w8NPLrUGYfv-GfsFEQST4kAec"

COOKIE_STR = "CompanyCode=55ksn4bu; x-culture=vi; x-deviceid=4b167208-a5a1-43b8-8ba9-c7141880434f; x-sessionid=9244cd92adfb4067a487aa6f93d0a23881df9e76b6c1489d9cade4f1e080edf7; x-tenantsource=FromTenantRequest; x-tenantid=9244cd92-adfb-4067-a487-aa6f93d0a238; x-login-from=basic"

HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Accept": "application/json, text/plain, */*",
    "Content-Type": "application/json",
    "companycode": "55ksn4bu",
    "layoutcode": "promotion",
    "X-MISA-Language": "vi-VN",
    "Origin": "https://amisapp.misa.vn",
}
COOKIES = {p.split("=", 1)[0].strip(): p.split("=", 1)[1].strip() for p in COOKIE_STR.split(";") if "=" in p}

# Read IDs from existing giamgia.json
current = json.load(open("giamgia.json", encoding="utf-8"))
all_ids = [int(k) for k in current.keys()]
print(f"Total {len(all_ids)} promotions: {all_ids}")

# FormConfigNew endpoint (same pattern as price books)
URL = "https://amisapp.misa.vn/promotion/g2/api/business/Promotion/FormConfigNew/Promotion/120/4"

results = {}
for pid in all_ids:
    print(f"  Fetching ID={pid}...", end=" ", flush=True)
    try:
        resp = httpx.post(
            URL,
            json={"ID": str(pid), "MISAEntityState": 2, "ActiveLayoutCode": None, "CustomDicData": None},
            headers=HEADERS,
            cookies=COOKIES,
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        results[str(pid)] = data

        # Extract key fields for verification
        fields = {f["FieldName"]: f for f in
                  data.get("Data", {}).get("FormLayout", {}).get("InforFields", [])}
        code = fields.get("PromotionCode", {}).get("Text", "?")
        name = fields.get("PromotionName", {}).get("Text", "?")
        print(f"OK  {code} - {name[:40]}")
    except Exception as e:
        print(f"ERROR: {e}")
        results[str(pid)] = {"error": str(e)}
    time.sleep(0.3)

with open("giamgia_headers.json", "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)
print(f"\nDone -> giamgia_headers.json ({len(results)} entries)")
