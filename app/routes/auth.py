from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..db import get_sessionmaker
from ..telegram import validate_init_data
from ..settings import settings
from ..models import User
from ..jwt import sign_token
from ..schemas import UserDto

router = APIRouter(prefix="/api/auth", tags=["auth"])

class TelegramAuthIn(BaseModel):
    initData: str

@router.post("/telegram")
def telegram_auth(payload: TelegramAuthIn):
    if not (settings.BOT_TOKEN or "").strip():
        raise HTTPException(status_code=500, detail="BOT_TOKEN is not set")
    try:
        parsed = validate_init_data(payload.initData, settings.BOT_TOKEN)
        user = parsed.get("user")
        if not user:
            raise HTTPException(status_code=400, detail="NO_USER_IN_INITDATA")

        tg_id = int(user["id"])

        SessionLocal = get_sessionmaker()
db: Session = SessionLocal()
        try:
            existing: User | None = db.query(User).filter(User.tg_id == tg_id).first()
            if existing:
                existing.username = user.get("username")
                existing.first_name = user.get("first_name")
                existing.last_name = user.get("last_name")
                existing.photo_url = user.get("photo_url")
                db.add(existing)
                db.commit()
                db.refresh(existing)
                u = existing
            else:
                u = User(
                    tg_id=tg_id,
                    username=user.get("username"),
                    first_name=user.get("first_name"),
                    last_name=user.get("last_name"),
                    photo_url=user.get("photo_url"),
                )
                db.add(u)
                db.commit()
                db.refresh(u)

            token = sign_token(u.id, u.tg_id)
            return {
                "token": token,
                "user": UserDto(
                    id=u.id,
                    tgId=str(u.tg_id),
                    username=u.username,
                    firstName=u.first_name,
                    lastName=u.last_name,
                    photoUrl=u.photo_url,
                ).model_dump()
            }
        finally:
            db.close()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
