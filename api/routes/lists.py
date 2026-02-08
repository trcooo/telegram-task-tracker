from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List as TList

from ..deps import get_db, get_current_user
from ..models import List, User
from ..schemas import ListCreate, ListOut

router = APIRouter()

@router.get("", response_model=TList[ListOut])
def get_lists(db: Session = Depends(get_db), user_and_jwt=Depends(get_current_user)):
    user, _ = user_and_jwt
    return db.query(List).filter(List.user_id == user.id).order_by(List.created_at.asc()).all()

@router.post("", response_model=ListOut)
def create_list(payload: ListCreate, db: Session = Depends(get_db), user_and_jwt=Depends(get_current_user)):
    user, _ = user_and_jwt
    lst = List(user_id=user.id, title=payload.title, color=payload.color)
    db.add(lst)
    db.commit()
    db.refresh(lst)
    return lst
