import base64
import json
import threading
import time
from typing import Any, Optional

import httpx

from app.config import settings

MISA_BASE_URL = "https://crmconnect.misa.vn"
MISA_APP_ID_KEY = "misa_app_id"
MISA_SECRET_KEY = "misa_client_secret"


class MisaClient:
    """Thread-safe MISA CRM API client with automatic token refresh."""

    def __init__(self):
        self._token: Optional[str] = None
        self._token_exp: float = 0
        self._lock = threading.Lock()

    def get_credentials(self) -> tuple[str, str]:
        app_id = settings.APP_ID
        client_secret = settings.MISA_CLIENT_SECRET
        try:
            from app.database import SessionLocal
            from app.models.sys_config import SysConfig

            db = SessionLocal()
            try:
                rows = (
                    db.query(SysConfig)
                    .filter(SysConfig.config_key.in_([MISA_APP_ID_KEY, MISA_SECRET_KEY]))
                    .all()
                )
                values = {row.config_key: row.config_value for row in rows}
                app_id = values.get(MISA_APP_ID_KEY) or app_id
                client_secret = values.get(MISA_SECRET_KEY) or client_secret
            finally:
                db.close()
        except Exception:
            pass
        return app_id.strip(), client_secret.strip()

    def invalidate_token(self):
        with self._lock:
            self._token = None
            self._token_exp = 0

    def _refresh_token(self) -> str:
        app_id, client_secret = self.get_credentials()
        if not app_id or not client_secret:
            raise RuntimeError("MISA credentials not configured (APP_ID, MISA_CLIENT_SECRET)")

        resp = httpx.post(
            f"{MISA_BASE_URL}/api/v2/Account",
            json={"client_id": app_id, "client_secret": client_secret},
            timeout=30,
        )
        resp.raise_for_status()
        body = resp.json()
        if not body.get("success"):
            raise RuntimeError(f"MISA login failed: {body}")

        token: str = body["data"]
        # Decode JWT exp without verifying signature
        try:
            payload_b64 = token.split(".")[1]
            payload_b64 += "=" * (4 - len(payload_b64) % 4)
            exp = json.loads(base64.b64decode(payload_b64)).get("exp", 0)
        except Exception:
            exp = time.time() + 3600  # fallback: 1 hour
        self._token = token
        self._token_exp = float(exp)
        return token

    def _get_token(self) -> str:
        with self._lock:
            if self._token and time.time() < self._token_exp - 60:
                return self._token
            return self._refresh_token()

    def _headers(self) -> dict:
        app_id, _ = self.get_credentials()
        return {
            "Authorization": f"Bearer {self._get_token()}",
            "Clientid": app_id,
        }

    def _get(self, path: str, params: Optional[dict] = None) -> Any:
        resp = httpx.get(f"{MISA_BASE_URL}{path}", headers=self._headers(), params=params, timeout=30)
        resp.raise_for_status()
        return resp.json()

    def _post(self, path: str, body: Any) -> Any:
        resp = httpx.post(f"{MISA_BASE_URL}{path}", headers=self._headers(), json=body, timeout=30)
        resp.raise_for_status()
        return resp.json()

    def _put(self, path: str, body: Any) -> Any:
        resp = httpx.put(f"{MISA_BASE_URL}{path}", headers=self._headers(), json=body, timeout=30)
        resp.raise_for_status()
        return resp.json()

    def _delete(self, path: str, body: Any) -> Any:
        resp = httpx.request("DELETE", f"{MISA_BASE_URL}{path}", headers=self._headers(), json=body, timeout=30)
        resp.raise_for_status()
        return resp.json()

    # ── Account ──────────────────────────────────────────────────────────────

    def get_token_info(self) -> dict:
        """Force refresh token and return raw response (for testing credentials)."""
        with self._lock:
            return self._refresh_token()

    # ── Contacts ─────────────────────────────────────────────────────────────

    def list_contacts(self, page: int = 0, page_size: int = 10,
                      order_by: str = "modified_date", is_descending: bool = True) -> Any:
        return self._get("/api/v2/Contacts", {
            "page": page, "pageSize": page_size,
            "orderBy": order_by, "isDescending": is_descending,
        })

    def get_contacts_by_id(self, ids: list[int]) -> Any:
        return self._get("/api/v2/Contacts/id", [("ids", i) for i in ids])

    def get_contacts_by_code(self, codes: list[str]) -> Any:
        return self._get("/api/v2/Contacts/code", [("code", c) for c in codes])

    def create_contacts(self, data: list[dict]) -> Any:
        return self._post("/api/v2/Contacts", data)

    def update_contacts(self, data: list[dict]) -> Any:
        return self._put("/api/v2/Contacts", data)

    def delete_contacts(self, ids: list[int]) -> Any:
        return self._delete("/api/v2/Contacts", ids)

    # ── Customers ────────────────────────────────────────────────────────────

    def list_customers(self, page: int = 0, page_size: int = 10,
                       order_by: str = "modified_date", is_descending: bool = True) -> Any:
        return self._get("/api/v2/Customers", {
            "page": page, "pageSize": page_size,
            "orderBy": order_by, "isDescending": is_descending,
        })

    def get_customers_by_id(self, ids: list[int]) -> Any:
        return self._get("/api/v2/Customers/id", [("ids", i) for i in ids])

    def get_customers_by_code(self, codes: list[str]) -> Any:
        return self._get("/api/v2/Customers/code", [("code", c) for c in codes])

    def create_customers(self, data: list[dict]) -> Any:
        return self._post("/api/v2/Customers", data)

    def update_customers(self, data: list[dict]) -> Any:
        return self._put("/api/v2/Customers", data)

    def delete_customers(self, ids: list[int]) -> Any:
        return self._delete("/api/v2/Customers", ids)

    # ── Promotions ───────────────────────────────────────────────────────────

    def list_promotions(self, page: int = 0, page_size: int = 50,
                        order_by: str = "modified_date", is_descending: bool = True) -> Any:
        return self._get("/api/v2/Promotions", {
            "page": page, "pageSize": page_size,
            "orderBy": order_by, "isDescending": is_descending,
        })

    def get_promotion_items(self, promotion_id: int) -> Any:
        """Get detail items (bought + gift) for a specific promotion."""
        return self._get("/api/v2/PromotionItems", {"promotionId": promotion_id})

    # ── Products ─────────────────────────────────────────────────────────────

    def list_products(self, page: int = 0, page_size: int = 10,
                      order_by: str = "modified_date", is_descending: bool = True) -> Any:
        return self._get("/api/v2/Products", {
            "page": page, "pageSize": page_size,
            "orderBy": order_by, "isDescending": is_descending,
        })

    def get_products_by_id(self, ids: list[int]) -> Any:
        return self._get("/api/v2/Products/id", [("ids", i) for i in ids])

    def get_products_by_code(self, codes: list[str]) -> Any:
        return self._get("/api/v2/Products/code", [("code", c) for c in codes])

    def create_products(self, data: list[dict]) -> Any:
        return self._post("/api/v2/Products", data)

    def update_products(self, data: list[dict]) -> Any:
        return self._put("/api/v2/Products", data)

    def delete_products(self, ids: list[int]) -> Any:
        return self._delete("/api/v2/Products", ids)

    # ── SaleOrders ───────────────────────────────────────────────────────────

    def list_sale_orders(self, page: int = 0, page_size: int = 10,
                         order_by: str = "modified_date", is_descending: bool = True) -> Any:
        return self._get("/api/v2/SaleOrders", {
            "page": page, "pageSize": page_size,
            "orderBy": order_by, "isDescending": is_descending,
        })

    def get_sale_orders_by_id(self, ids: list[int]) -> Any:
        return self._get("/api/v2/SaleOrders/id", [("ids", i) for i in ids])

    def get_sale_orders_by_code(self, codes: list[str]) -> Any:
        return self._get("/api/v2/SaleOrders/code", [("code", c) for c in codes])

    def create_sale_orders(self, data: list[dict]) -> Any:
        return self._post("/api/v2/SaleOrders", data)

    def update_sale_orders(self, data: list[dict]) -> Any:
        return self._put("/api/v2/SaleOrders", data)

    def delete_sale_orders(self, ids: list[int]) -> Any:
        return self._delete("/api/v2/SaleOrders", ids)

    # ── Stocks ───────────────────────────────────────────────────────────────

    def list_stocks(self) -> Any:
        return self._get("/api/v2/Stocks")

    def get_stocks_by_code(self, codes: list[str]) -> Any:
        return self._get("/api/v2/Stocks/code", [("stockCode", c) for c in codes])

    def create_stocks(self, data: list[dict]) -> Any:
        return self._post("/api/v2/Stocks", data)

    def update_stocks(self, data: list[dict]) -> Any:
        return self._put("/api/v2/Stocks", data)

    def delete_stocks(self, ids: list[str]) -> Any:
        return self._delete("/api/v2/Stocks", ids)

    def list_stock_ledger(self, page: int = 0, page_size: int = 10,
                          stock_id: Optional[str] = None) -> Any:
        params: dict = {"page": page, "pageSize": page_size}
        if stock_id:
            params["stockID"] = stock_id
        return self._get("/api/v2/Stocks/product_ledger", params)

    def update_stock_ledger(self, data: list[dict]) -> Any:
        return self._post("/api/v2/Stocks/product_ledger", data)


misa_client = MisaClient()
