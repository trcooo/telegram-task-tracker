from datetime import datetime, timedelta
from jose import jwt, JWTError
from .settings import settings

ALGO = "HS256"

def sign_token(user_id: str, tg_id: int) -> str:
    payload = {
        "user_id": user_id,
        "tg_id": str(tg_id),
        "exp": datetime.utcnow() + timedelta(days=30),
        "iat": datetime.utcnow()
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=ALGO)

def verify_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[ALGO])
    except JWTError as e:
        raise ValueError("UNAUTHORIZED") from e
