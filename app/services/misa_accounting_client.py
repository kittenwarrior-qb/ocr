"""
Adapter cho MISA Kế toán (AMIS Accounting) Open API — phục vụ "Đơn mua hàng" (ĐMH).

Đây là điểm cắm DUY NHẤT để gắn endpoint thật về sau. Khi 3 biến config
MISA_ACCOUNTING_BASE_URL / _APP_ID / _SECRET đều có giá trị → gọi HTTP thật
(pattern token refresh giống MisaClient). Nếu thiếu bất kỳ giá trị nào → chạy
chế độ DRY-RUN: ghi payload ra data/po_payloads/<no>.json và trả về kết quả giả
lập để toàn bộ luồng review→submit vẫn dùng được khi chưa có quyền API.
"""
import base64
import json
import threading
import time
from pathlib import Path
from typing import Any, Optional

import httpx

from app.config import settings

PO_PAYLOAD_DIR = Path("data/po_payloads")


class MisaAccountingClient:
    """Thread-safe client cho MISA Kế toán, có dry-run khi chưa cấu hình."""

    def __init__(self):
        self._token: Optional[str] = None
        self._token_exp: float = 0
        self._lock = threading.Lock()

    # ── Cấu hình ──────────────────────────────────────────────────────────────

    def get_credentials(self) -> tuple[str, str, str]:
        return (
            (settings.MISA_ACCOUNTING_BASE_URL or "").strip().rstrip("/"),
            (settings.MISA_ACCOUNTING_APP_ID or "").strip(),
            (settings.MISA_ACCOUNTING_SECRET or "").strip(),
        )

    def is_configured(self) -> bool:
        base, app_id, secret = self.get_credentials()
        return bool(base and app_id and secret)

    # ── Token (chỉ dùng khi đã cấu hình) ─────────────────────────────────────

    def _refresh_token(self) -> str:
        base, app_id, secret = self.get_credentials()
        resp = httpx.post(
            f"{base}/api/oauth/actestablish",
            json={"app_id": app_id, "client_secret": secret},
            timeout=30,
        )
        resp.raise_for_status()
        body = resp.json()
        if not body.get("success", True):
            raise RuntimeError(f"MISA Accounting login failed: {body}")
        token: str = body.get("data") or body.get("access_token") or ""
        try:
            payload_b64 = token.split(".")[1]
            payload_b64 += "=" * (4 - len(payload_b64) % 4)
            exp = json.loads(base64.b64decode(payload_b64)).get("exp", 0)
        except Exception:
            exp = time.time() + 3600
        self._token = token
        self._token_exp = float(exp)
        return token

    def _get_token(self) -> str:
        with self._lock:
            if self._token and time.time() < self._token_exp - 60:
                return self._token
            return self._refresh_token()

    # ── Tạo Đơn mua hàng ──────────────────────────────────────────────────────

    def create_purchase_order(self, payload: dict) -> dict[str, Any]:
        """
        Gửi 1 đơn mua hàng lên MISA Kế toán. Trả về dict dạng:
          { "success": bool, "dry_run": bool, "no": str, "data"/"payload"/... }
        """
        no = payload.get("no") or "DMH"

        if not self.is_configured():
            self._write_payload_file(no, payload)
            return {
                "success": True,
                "dry_run": True,
                "no": no,
                "message": "Chưa cấu hình API Kế toán — đã lưu payload JSON (dry-run).",
                "payload": payload,
            }

        base, app_id, _ = self.get_credentials()
        resp = httpx.post(
            f"{base}/api/v1/purchase-orders",
            headers={
                "Authorization": f"Bearer {self._get_token()}",
                "X-MISA-AppId": app_id,
                "Content-Type": "application/json",
            },
            json=[payload],
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        return {"success": bool(data.get("success", True)), "dry_run": False, "no": no, "data": data}

    @staticmethod
    def _write_payload_file(no: str, payload: dict) -> Path:
        PO_PAYLOAD_DIR.mkdir(parents=True, exist_ok=True)
        path = PO_PAYLOAD_DIR / f"{no}.json"
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        return path


misa_accounting_client = MisaAccountingClient()
