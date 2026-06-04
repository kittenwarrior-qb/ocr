import json
from pathlib import Path
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db

router = APIRouter(prefix="/vouchers", tags=["Vouchers"])

DATA_FILE = Path(__file__).parent.parent.parent / "data" / "vouchers.json"


def _load() -> list[dict]:
    if not DATA_FILE.exists():
        return []
    return json.loads(DATA_FILE.read_text(encoding="utf-8"))


def _get_customer_type(customer_code: str, db: Session) -> str:
    """Lấy loại KH từ DB để match voucher theo loại."""
    try:
        from app.models.partner import Partner
        c = db.query(Partner).filter(
            Partner.code == customer_code,
            Partner.partner_type == "customer",
        ).first()
        if not c:
            return ""
        return (c.display_name or "") if c.display_name != c.legal_name else ""
    except Exception:
        return ""


def _get_customer_types_bulk(customer_codes: list[str], db: Session) -> dict[str, str]:
    if not customer_codes:
        return {}
    try:
        from app.models.partner import Partner
        rows = db.query(Partner.code, Partner.display_name, Partner.legal_name).filter(
            Partner.code.in_(customer_codes),
            Partner.partner_type == "customer",
        ).all()
        return {
            r.code: (r.display_name or "") if r.display_name != r.legal_name else ""
            for r in rows
        }
    except Exception:
        return {}


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
def vouchers_for_customers(codes: str = Query(""), db: Session = Depends(get_db)):
    """
    Return vouchers keyed by customer_code.
    Matching rules:
      - target == "Tất cả khách hàng" (or empty customers): applies to all
      - target == "Theo loại khách hàng": match if customer's type contains voucher's customer_type
      - target == "Theo khách hàng cụ thể": match if customer_code in voucher's customers list
    """
    if not codes:
        return {}
    code_list = [c.strip() for c in codes.split(",") if c.strip()]
    all_vouchers = _load()
    customer_types = _get_customer_types_bulk(code_list, db)
    result: dict[str, list] = {c: [] for c in code_list}

    for v in all_vouchers:
        if not v.get("is_active", True):
            continue
        target = v.get("target", "")
        cust_type = v.get("customer_type", "") or ""
        specific = v.get("customers", []) or []

        for c in code_list:
            if target == "Theo loại khách hàng" and cust_type:
                ctype = customer_types.get(c, "")
                if any(t.strip() in ctype for t in cust_type.split(",")):
                    result[c].append(v)
            elif target == "Theo khách hàng cụ thể" and specific:
                if c in specific:
                    result[c].append(v)
            else:
                # "Tất cả khách hàng" hoặc không có target cụ thể
                if not specific and target != "Theo khách hàng cụ thể":
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
