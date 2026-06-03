"""
chietkhau.json  = {id: FormConfigNew response}   — bảng giá chi tiết
giamgia.json    = {id: PromoInfo response}        — khuyến mãi chi tiết
"""
import json
from pathlib import Path

_ROOT = Path(__file__).parent.parent.parent
_CK_FILE = _ROOT / "chietkhau.json"   # price books (FormConfigNew)
_GG_FILE = _ROOT / "giamgia.json"     # promotions (PromoInfo)


# ── helpers ──────────────────────────────────────────────────────────────────

def _load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _infor_fields(entry: dict) -> dict[str, dict]:
    """Map FieldName → field object from FormConfigNew InforFields."""
    fields = entry.get("Data", {}).get("FormLayout", {}).get("InforFields", [])
    return {f["FieldName"]: f for f in fields}


# ── Chiết khấu (Price Books) ─────────────────────────────────────────────────

def get_pricebook_list() -> list[dict]:
    """Trả danh sách bảng giá từ chietkhau.json (FormConfigNew format)."""
    data = _load(_CK_FILE)
    result = []
    for pid, entry in data.items():
        if not entry.get("Success"):
            continue
        fields = _infor_fields(entry)
        result.append({
            "ID": int(pid),
            "PriceBookCode": fields.get("PriceBookCode", {}).get("Text", ""),
            "PriceBookName": fields.get("PriceBookName", {}).get("Text", ""),
            "ObjectIDText": fields.get("ObjectID", {}).get("Text", ""),
            "AccountTypeIDText": fields.get("AccountTypeID", {}).get("Text", ""),
            "DiscountType": fields.get("DiscountType", {}).get("Text", ""),
            "DiscountValue": fields.get("DiscountValue", {}).get("Value", ""),
            "FromDate": fields.get("FromDate", {}).get("Text", ""),
            "ToDate": fields.get("ToDate", {}).get("Text", ""),
            "Inactive": fields.get("Inactive", {}).get("Value") == "true",
            "OwnerIDText": fields.get("OwnerID", {}).get("Text", ""),
        })
    return result


def get_all_pricebook_details() -> dict:
    return _load(_CK_FILE)


def get_pricebook_by_id(pb_id: int) -> dict | None:
    return _load(_CK_FILE).get(str(pb_id))


# ── Giảm giá / Khuyến mãi (Promotions) ──────────────────────────────────────

def get_giamgia_list() -> list[dict]:
    """Trả danh sách khuyến mãi từ giamgia.json (PromoInfo format)."""
    data = _load(_GG_FILE)
    result = []
    for pid, entry in data.items():
        if not entry.get("Success"):
            continue
        items: list[dict] = entry.get("Data", [])
        result.append({
            "ID": int(pid),
            "PromotionID": int(pid),
            "ItemCount": len(items),
            "Items": items,
        })
    return result


def get_all_giamgia_details() -> dict:
    return _load(_GG_FILE)


def get_giamgia_by_id(gid: int) -> dict | None:
    return _load(_GG_FILE).get(str(gid))
