import json
from pathlib import Path
from fastapi import APIRouter, Query

router = APIRouter(prefix="/vouchers", tags=["Vouchers"])

DATA_FILE = Path(__file__).parent.parent.parent / "data" / "vouchers.json"


def _load() -> list[dict]:
    if not DATA_FILE.exists():
        return []
    return json.loads(DATA_FILE.read_text(encoding="utf-8"))


@router.get("")
def list_vouchers(
    search: str = "",
    customer_code: str = "",
    skip: int = 0,
    limit: int = 100,
):
    """List all vouchers, optionally filtered by customer_code or search."""
    items = _load()

    if customer_code:
        items = [
            v for v in items
            if not v.get("customers")                      # empty = all customers
            or customer_code in v.get("customers", [])
        ]

    if search:
        q = search.lower()
        items = [
            v for v in items
            if q in v.get("code", "").lower()
            or q in v.get("name", "").lower()
            or q in v.get("description", "").lower()
        ]

    total = len(items)
    return {"items": items[skip: skip + limit], "total": total}


@router.get("/for-customers")
def vouchers_for_customers(codes: str = Query("")):
    """
    Return vouchers keyed by customer_code.
    `codes` = comma-separated list of customer codes.
    Returns { customer_code: [voucher, ...] }
    """
    if not codes:
        return {}
    code_list = [c.strip() for c in codes.split(",") if c.strip()]
    all_vouchers = _load()
    result: dict[str, list] = {c: [] for c in code_list}
    for v in all_vouchers:
        if not v.get("is_active", True):
            continue
        targets = v.get("customers", [])
        if not targets:
            for c in code_list:
                result[c].append(v)
        else:
            for c in code_list:
                if c in targets:
                    result[c].append(v)
    return result


@router.post("")
def upsert_voucher(body: dict):
    """Create or update a voucher (matched by code)."""
    items = _load()
    code = body.get("code", "").strip()
    if not code:
        return {"error": "code required"}, 400
    idx = next((i for i, v in enumerate(items) if v.get("code") == code), None)
    if idx is not None:
        items[idx] = body
    else:
        items.append(body)
    DATA_FILE.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    return body


@router.delete("/{code}")
def delete_voucher(code: str):
    items = _load()
    items = [v for v in items if v.get("code") != code]
    DATA_FILE.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"deleted": code}
