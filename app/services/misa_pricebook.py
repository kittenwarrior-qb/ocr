import json
from pathlib import Path

_ROOT = Path(__file__).parent.parent.parent
_PB_FILE = _ROOT / "data" / "pricebooks.json"


def _load_pricebooks() -> list[dict]:
    if not _PB_FILE.exists():
        return []
    return json.loads(_PB_FILE.read_text(encoding="utf-8"))


def _get_customer_type(customer_code: str) -> str:
    """Lookup customer type from DB (always fresh, no stale JSON)."""
    try:
        from app.database import SessionLocal
        from app.models.partner import Partner
        db = SessionLocal()
        try:
            c = db.query(Partner).filter(
                Partner.code == customer_code,
                Partner.partner_type == "customer",
            ).first()
            if not c:
                return ""
            return (c.display_name or "") if c.display_name != c.legal_name else ""
        finally:
            db.close()
    except Exception:
        return ""


def _get_customer_types_bulk(customer_codes: list[str]) -> dict[str, str]:
    """Lookup customer types for multiple codes in one DB query."""
    if not customer_codes:
        return {}
    try:
        from app.database import SessionLocal
        from app.models.partner import Partner
        db = SessionLocal()
        try:
            rows = db.query(Partner.code, Partner.display_name, Partner.legal_name).filter(
                Partner.code.in_(customer_codes),
                Partner.partner_type == "customer",
            ).all()
            return {
                r.code: (r.display_name or "") if r.display_name != r.legal_name else ""
                for r in rows
            }
        finally:
            db.close()
    except Exception:
        return {}


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
    Customer types fetched live from DB — always up to date.
    """
    pricebooks = _load_pricebooks()
    customer_types = _get_customer_types_bulk(customer_codes)
    result: dict[str, list] = {c: [] for c in customer_codes}

    for pb in pricebooks:
        target = pb.get("target", "")
        cust_type = pb.get("customer_type", "") or ""
        pb_customers: list[str] = pb.get("customers", []) or []

        for code in customer_codes:
            if target == "Tất cả khách hàng":
                result[code].append(pb)
            elif target == "Theo loại khách hàng" and cust_type:
                customer_type_str = customer_types.get(code, "")
                if any(t.strip() in customer_type_str for t in cust_type.split(",")):
                    result[code].append(pb)
            elif target == "Theo khách hàng cụ thể" and code in pb_customers:
                result[code].append(pb)

    return result
