"""
Server-side in-memory cache cho dữ liệu MISA.
Fetch all pages từ MISA 1 lần, cache 10 phút.
"""
import time
from typing import Any, Callable

_store: dict[str, tuple[list, float]] = {}
TTL = 600  # 10 phút


def _extract(resp: dict) -> list:
    data = resp.get("data")
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return data.get("data") or data.get("items") or []
    return []


def fetch_all(fetch_fn: Callable, page_size: int = 100) -> list:
    items: list = []
    page = 0
    while True:
        chunk = _extract(fetch_fn(page=page, page_size=page_size))
        if not chunk:
            break
        items.extend(chunk)
        if len(chunk) < page_size:
            break
        page += 1
    return items


def get_or_fetch(key: str, fetch_fn: Callable) -> list:
    entry = _store.get(key)
    if entry and time.time() - entry[1] < TTL:
        return entry[0]
    data = fetch_all(fetch_fn)
    _store[key] = (data, time.time())
    return data


def invalidate(key: str | None = None) -> None:
    if key:
        _store.pop(key, None)
    else:
        _store.clear()
