from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from ..auth_dep import get_current_user
from ..db import get_db
from ..models import User, Project

router = APIRouter(prefix="/api/projects", tags=["projects"])

class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    color: str | None = Field(default=None, max_length=20)

@router.get("")
def list_projects(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    items = db.query(Project).filter(Project.user_id == user.id).order_by(Project.created_at.desc()).all()
    return {"items": [{"id": p.id, "name": p.name, "color": p.color} for p in items]}

@router.post("")
def create_project(payload: ProjectCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = Project(user_id=user.id, name=payload.name, color=payload.color)
    db.add(p)
    db.commit()
    db.refresh(p)
    return {"item": {"id": p.id, "name": p.name, "color": p.color}}

@router.delete("/{project_id}")
def delete_project(project_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.query(Project).filter(Project.id == project_id, Project.user_id == user.id).first()
    if not p:
        raise HTTPException(status_code=404, detail="NOT_FOUND")
    db.delete(p)
    db.commit()
    return {"ok": True}
