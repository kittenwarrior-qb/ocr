"""
Auto-map customer from OCR order data using fuzzy name + address matching
against the local customers.json catalog.
"""
import json
import re
import unicodedata
from pathlib import Path
from typing import Optional

# Load customers catalog once at import time
_CATALOG_PATH = Path(__file__).parent.parent.parent / "frontend-v2/src/data/customers.json"
_customers: list[dict] = []

def _load():
    global _customers
    if not _customers and _CATALOG_PATH.exists():
        with open(_CATALOG_PATH, encoding="utf-8") as f:
            _customers = json.load(f)

def _normalize(text: str) -> str:
    if not text:
        return ""
    text = text.lower()
    # Remove Vietnamese diacritics
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    # Remove special chars
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text

_COMPANY_PREFIXES = re.compile(
    r"^(cong ty tnhh|cong ty co phan|cong ty|ho kinh doanh|"
    r"doanh nghiep tu nhan|chi nhanh|trung tam|tap doan)\s+",
    re.IGNORECASE,
)

def _strip_prefix(name: str) -> str:
    return _COMPANY_PREFIXES.sub("", _normalize(name)).strip()

def _word_overlap(query: str, target: str) -> float:
    q_words = [w for w in _strip_prefix(query).split() if len(w) > 2]
    t_norm = _strip_prefix(target)
    if not q_words:
        return 0.0
    matches = sum(1 for w in q_words if w in t_norm)
    return matches / len(q_words)

def _substring_score(query: str, target: str) -> float:
    q = _strip_prefix(query)
    t = _strip_prefix(target)
    if not q or not t:
        return 0.0
    if t and q in t:
        return 1.0
    if q and t in q and len(t) > 5:
        return 0.85
    return 0.0

def _address_score(query_addr: str, target_addr: str) -> float:
    if not query_addr or not target_addr:
        return 0.0
    q = _normalize(query_addr)
    t = _normalize(target_addr)
    cities = ["ho chi minh", "ha noi", "da nang", "can tho", "dong nai", "binh duong",
              "dong thap", "ca mau", "khanh hoa", "tay ninh", "long an", "bac ninh"]
    for city in cities:
        if city in q and city in t:
            return 0.3
    return 0.0

def find_best_customer(
    company_name: str,
    address: Optional[str] = None,
    threshold: float = 0.45,
) -> Optional[dict]:
    """
    Returns the best matching customer dict or None.
    Fields: code, name, type, tax_code, phone, email,
            invoice_address, invoice_city, invoice_district,
            invoice_ward, owner, delivery_address
    """
    _load()
    if not company_name or not _customers:
        return None

    best_score = 0.0
    best_customer = None

    for c in _customers:
        sub = _substring_score(company_name, c.get("name", ""))
        overlap = _word_overlap(company_name, c.get("name", ""))
        addr = _address_score(address or "", c.get("invoice_address", ""))
        score = max(sub, overlap * 0.9) + addr * 0.2

        if score > best_score:
            best_score = score
            best_customer = c

    if best_score >= threshold:
        return best_customer
    return None
