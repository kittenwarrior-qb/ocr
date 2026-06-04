import json
from pathlib import Path

_ROOT = Path(__file__).parent.parent.parent
_PB_FILE = _ROOT / "data" / "pricebooks.json"
_CUSTOMERS_FILE = _ROOT / "data" / "customers.json"


def _load_pricebooks() -> list[dict]:
    if not _PB_FILE.exists():
        return []
    return json.loads(_PB_FILE.read_text(encoding="utf-8"))


def _load_customers() -> dict[str, dict]:
    """Returns {code: customer} map."""
    if not _CUSTOMERS_FILE.exists():
        return {}
    data = json.loads(_CUSTOMERS_FILE.read_text(encoding="utf-8"))
    return {c["code"]: c for c in data if c.get("code")}


# ── Chiết khấu (Price Books) ─────────────────────────────────────────────────

def get_pricebook_list() -> list[dict]:
    return [
        {k: v for k, v in pb.items() if k != "items"}
        for pb in _load_pricebooks()
    ]


def get_all_pricebook_details() -> list[dict]:
    return _load_pricebooks()


def get_pricebook_by_code(code: str) -> dict | None:
    return next((pb for pb in _load_pricebooks() if pb["code"] == code), None)


def get_pricebooks_for_customers(customer_codes: list[str]) -> dict[str, list[dict]]:
    """
    Return pricebooks keyed by customer_code.
    Matching rules:
      - target == "Tất cả khách hàng": applies to all
      - target == "Theo loại khách hàng": match if customer type contains pricebook's customer_type
      - target == "Theo khách hàng cụ thể": match if customer_code in pricebook's customers list
    """
    pricebooks = _load_pricebooks()
    customers_map = _load_customers()
    result: dict[str, list] = {c: [] for c in customer_codes}

    for pb in pricebooks:
        target = pb.get("target", "")
        cust_type = pb.get("customer_type", "") or ""
        pb_customers: list[str] = pb.get("customers", []) or []

        for code in customer_codes:
            if target == "Tất cả khách hàng":
                result[code].append(pb)
            elif target == "Theo loại khách hàng" and cust_type:
                customer = customers_map.get(code, {})
                customer_types = customer.get("type", "") or ""
                if any(t.strip() in customer_types for t in cust_type.split(",")):
                    result[code].append(pb)
            elif target == "Theo khách hàng cụ thể" and code in pb_customers:
                result[code].append(pb)

    return result
