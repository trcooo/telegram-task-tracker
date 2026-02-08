from fastapi import Header, HTTPException, Request, Depends
from sqlalchemy.orm import Session
from typing import Optional, Tuple

from .db import SessionLocal
from .security import verify_jwt, validate_init_data, sign_jwt
from .models import User

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_current_user(request: Request, authorization: Optional[str] = Header(default=None), x_tg_init_data: Optional[str] = Header(default=None), x_user_key: Optional[str] = Header(default=None), db: Session = None) -> Tuple[User, str]:
    """
    Returns (user, jwt). Accepts:
    - Authorization: Bearer <jwt>
    - or X-Tg-Init-Data (Telegram WebApp initData) to mint a JWT
    - or X-User-Key for non-Telegram local/dev
    """

    # 1) JWT
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        payload = verify_jwt(token)
        if payload and "user_id" in payload:
            user = db.get(User, str(payload["user_id"]))
            if user:
                return user, token

    # 2) Telegram initData
    if x_tg_init_data:
        try:
            parsed = validate_init_data(x_tg_init_data)
            tg_user = parsed.get("user") or {}
            user_id = str(tg_user.get("id"))
            if not user_id or user_id == "None":
                raise ValueError("Telegram user id missing")

            user = db.get(User, user_id)
            if not user:
                user = User(
                    id=user_id,
                    first_name=tg_user.get("first_name"),
                    username=tg_user.get("username"),
                )
                db.add(user)
                db.commit()
                db.refresh(user)

            jwt_token = sign_jwt({"user_id": user.id})
            return user, jwt_token
        except Exception as e:
            raise HTTPException(status_code=401, detail=f"invalid initData: {e}")

    # 3) Dev mode user key
    if x_user_key:
        user_id = f"dev_{x_user_key[:24]}"
        user = db.get(User, user_id)
        if not user:
            user = User(id=user_id, first_name="Dev", username="dev")
            db.add(user)
            db.commit()
            db.refresh(user)
        jwt_token = sign_jwt({"user_id": user.id}, ttl_seconds=60*60*24*365)
        return user, jwt_token

    raise HTTPException(status_code=401, detail="invalid token")
