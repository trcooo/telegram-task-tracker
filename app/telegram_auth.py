import hmac
import hashlib
from urllib.parse import parse_qsl
from typing import Any

def validate_init_data(init_data: str, bot_token: str) -> dict[str, Any] | None:
    """
    Validates Telegram WebApp initData.
    Returns parsed dict if valid, else None.
    """
    try:
        data = dict(parse_qsl(init_data, keep_blank_values=True))
        received_hash = data.pop("hash", None)
        if not received_hash:
            return None

        # Build data check string
        pairs = [f"{k}={v}" for k, v in sorted(data.items())]
        data_check_string = "\n".join(pairs).encode("utf-8")

        # secret key = HMAC_SHA256("WebAppData", bot_token)
        secret_key = hmac.new(b"WebAppData", bot_token.encode("utf-8"), hashlib.sha256).digest()
        calc_hash = hmac.new(secret_key, data_check_string, hashlib.sha256).hexdigest()

        if not hmac.compare_digest(calc_hash, received_hash):
            return None

        # Parse user JSON if present
        if "user" in data:
            import json
            try:
                data["user"] = json.loads(data["user"])
            except Exception:
                pass
        return data
    except Exception:
        return None
