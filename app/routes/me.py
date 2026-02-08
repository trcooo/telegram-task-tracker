from fastapi import APIRouter, Depends
from ..auth_dep import get_current_user
from ..models import User

router = APIRouter(prefix="/api/me", tags=["me"])

@router.get("")
def me(user: User = Depends(get_current_user)):
    return {
        "user": {
            "id": user.id,
            "tgId": str(user.tg_id),
            "username": user.username,
            "firstName": user.first_name,
            "lastName": user.last_name,
            "photoUrl": user.photo_url,
        }
    }
