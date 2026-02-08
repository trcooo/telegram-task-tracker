from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from ..auth_dep import get_current_user
from ..db import get_db
from ..models import User, Tag

router = APIRouter(prefix="/api/tags", tags=["tags"])

class TagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    color: str | None = Field(default=None, max_length=20)

@router.get("")
def list_tags(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    items = db.query(Tag).filter(Tag.user_id == user.id).order_by(Tag.name.asc()).all()
    return {"items": [{"id": t.id, "name": t.name, "color": t.color} for t in items]}

@router.post("")
def create_tag(payload: TagCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    t = Tag(user_id=user.id, name=payload.name, color=payload.color)
    db.add(t)
    db.commit()
    db.refresh(t)
    return {"item": {"id": t.id, "name": t.name, "color": t.color}}

@router.delete("/{tag_id}")
def delete_tag(tag_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    t = db.query(Tag).filter(Tag.id == tag_id, Tag.user_id == user.id).first()
    if not t:
        raise HTTPException(status_code=404, detail="NOT_FOUND")
    db.delete(t)
    db.commit()
    return {"ok": True}
