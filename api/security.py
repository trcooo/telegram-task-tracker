import os
import hmac
import hashlib
import time
import jwt
from typing import Any, Dict, Optional
from urllib.parse import unquote, parse_qsl

JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret")
BOT_TOKEN = os.getenv("BOT_TOKEN", "")

def _telegram_secret_key() -> bytes:
    # secret key is sha256(bot_token)
    return hashlib.sha256(BOT_TOKEN.encode("utf-8")).digest()

def validate_init_data(init_data: str) -> Dict[str, Any]:
    """
    Validates Telegram WebApp initData.
    Returns parsed fields dict if valid, raises ValueError otherwise.
    """
    if not BOT_TOKEN:
        raise ValueError("BOT_TOKEN is not configured")

    # init_data is querystring: key=value&key=value...
    params = dict(parse_qsl(init_data, keep_blank_values=True))
    if "hash" not in params:
        raise ValueError("initData missing hash")

    received_hash = params.pop("hash")
    # data_check_string: sorted by key
    data_check_string = "\n".join([f"{k}={v}" for k, v in sorted(params.items())])

    secret_key = _telegram_secret_key()
    calc_hash = hmac.new(secret_key, data_check_string.encode("utf-8"), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(calc_hash, received_hash):
        raise ValueError("initData hash mismatch")

    # optional: auth_date freshness (24h)
    if "auth_date" in params:
        try:
            auth_date = int(params["auth_date"])
            if int(time.time()) - auth_date > 86400 * 7:
                raise ValueError("initData is too old")
        except Exception:
            pass

    # user is a JSON string
    user_json = params.get("user")
    user = {}
    if user_json:
        import json
        user = json.loads(user_json)

    return {"params": params, "user": user}

def sign_jwt(payload: Dict[str, Any], ttl_seconds: int = 60 * 60 * 24 * 30) -> str:
    now = int(time.time())
    to_sign = {**payload, "iat": now, "exp": now + ttl_seconds}
    return jwt.encode(to_sign, JWT_SECRET, algorithm="HS256")

def verify_jwt(token: str) -> Optional[Dict[str, Any]]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except Exception:
        return None
