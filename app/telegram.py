import hmac
import hashlib
import time
import json
from urllib.parse import parse_qsl

def validate_init_data(init_data_raw: str, bot_token: str, max_age_seconds: int = 86400) -> dict:
    pairs = dict(parse_qsl(init_data_raw, keep_blank_values=True))
    hash_value = pairs.get("hash")
    if not hash_value:
        raise ValueError("initData: missing hash")

    pairs.pop("hash", None)
    data_check_string = "\n".join(f"{k}={pairs[k]}" for k in sorted(pairs.keys()))

    secret_key = hmac.new(b"WebAppData", bot_token.encode("utf-8"), hashlib.sha256).digest()
    computed = hmac.new(secret_key, data_check_string.encode("utf-8"), hashlib.sha256).hexdigest()

    if computed != hash_value:
        raise ValueError("initData: bad hash")

    auth_date = int(pairs.get("auth_date", "0"))
    if not auth_date:
        raise ValueError("initData: bad auth_date")
    now = int(time.time())
    if now - auth_date > max_age_seconds:
        raise ValueError("initData: expired")

    user_raw = pairs.get("user")
    user = json.loads(user_raw) if user_raw else None
    return {"user": user, "auth_date": auth_date, "query_id": pairs.get("query_id")}
