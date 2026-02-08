from fastapi import APIRouter, Header, HTTPException
from sqlalchemy.orm import Session
from fastapi import Depends

from ..deps import get_db
from ..security import validate_init_data, sign_jwt
from ..models import User

router = APIRouter()

@router.post("/telegram")
def auth_telegram(x_tg_init_data: str = Header(default=""), db: Session = Depends(get_db)):
    if not x_tg_init_data:
        raise HTTPException(status_code=400, detail="X-Tg-Init-Data required")

    parsed = validate_init_data(x_tg_init_data)
    tg_user = parsed.get("user") or {}
    user_id = str(tg_user.get("id"))
    if not user_id or user_id == "None":
        raise HTTPException(status_code=400, detail="Telegram user id missing")

    user = db.get(User, user_id)
    if not user:
        user = User(id=user_id, first_name=tg_user.get("first_name"), username=tg_user.get("username"))
        db.add(user)
        db.commit()
        db.refresh(user)

    token = sign_jwt({"user_id": user.id})
    return {"token": token, "user": {"id": user.id, "first_name": user.first_name, "username": user.username}}
