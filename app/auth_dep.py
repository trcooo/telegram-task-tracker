from fastapi import Header, HTTPException, Depends
from sqlalchemy.orm import Session
from .db import get_db
from .jwt import verify_token
from .models import User

def get_current_user(authorization: str = Header(default=""), db: Session = Depends(get_db)) -> User:
    token = ""
    if authorization.startswith("Bearer "):
        token = authorization[7:]
    if not token:
        raise HTTPException(status_code=401, detail="UNAUTHORIZED")

    try:
        payload = verify_token(token)
    except ValueError:
        raise HTTPException(status_code=401, detail="UNAUTHORIZED")

    user = db.get(User, payload.get("user_id"))
    if not user:
        raise HTTPException(status_code=401, detail="UNAUTHORIZED")
    return user
