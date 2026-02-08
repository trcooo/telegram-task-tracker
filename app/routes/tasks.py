from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional, Literal
from sqlalchemy.orm import Session
from datetime import datetime

from ..auth_dep import get_current_user
from ..db import get_db
from ..models import User, Task, TaskStatus, TaskQuadrant, ReminderStatus
from ..utils import day_range, to_iso, parse_iso_to_naive

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000)
    priority: Optional[int] = Field(default=3, ge=1, le=4)
    quadrant: Optional[Literal[
        "Q1_URGENT_IMPORTANT",
        "Q2_NOT_URGENT_IMPORTANT",
        "Q3_URGENT_NOT_IMPORTANT",
        "Q4_NOT_URGENT_NOT_IMPORTANT"
    ]] = None
    startAt: Optional[str] = None
    dueAt: Optional[str] = None
    durationMin: Optional[int] = Field(default=45, ge=15, le=240)

class TaskUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000)
    status: Optional[Literal["TODO","DONE","ARCHIVED"]] = None
    priority: Optional[int] = Field(default=None, ge=1, le=4)
    quadrant: Optional[Literal[
        "Q1_URGENT_IMPORTANT",
        "Q2_NOT_URGENT_IMPORTANT",
        "Q3_URGENT_NOT_IMPORTANT",
        "Q4_NOT_URGENT_NOT_IMPORTANT"
    ] | None] = None
    startAt: Optional[str | None] = None
    dueAt: Optional[str | None] = None
    durationMin: Optional[int] = Field(default=None, ge=15, le=240)

def task_to_dto(t: Task):
    next_rem = None
    for r in sorted(t.reminders, key=lambda x: x.remind_at):
        if r.status == ReminderStatus.PENDING:
            next_rem = to_iso(r.remind_at)
            break
    return {
        "id": t.id,
        "title": t.title,
        "description": t.description,
        "status": t.status.value,
        "priority": t.priority,
        "quadrant": t.quadrant.value if t.quadrant else None,
        "startAt": to_iso(t.start_at),
        "dueAt": to_iso(t.due_at),
        "durationMin": t.duration_min,
        "nextReminderAt": next_rem
    }

@router.get("")
def list_tasks(
    status: Optional[Literal["TODO","DONE","ARCHIVED"]] = Query(default=None),
    date: Optional[str] = Query(default=None),
    from_: Optional[str] = Query(default=None, alias="from"),
    to: Optional[str] = Query(default=None),
    q: Optional[str] = Query(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(Task).filter(Task.user_id == user.id)

    if status:
        query = query.filter(Task.status == TaskStatus(status))

    if date:
        start, end = day_range(date)
        query = query.filter(
            (Task.start_at.between(start.replace(tzinfo=None), end.replace(tzinfo=None))) |
            (Task.due_at.between(start.replace(tzinfo=None), end.replace(tzinfo=None)))
        )

    if from_ and to:
        start = datetime.fromisoformat(from_.replace("Z","+00:00")).replace(tzinfo=None)
        end = datetime.fromisoformat(to.replace("Z","+00:00")).replace(tzinfo=None)
        query = query.filter(
            (Task.start_at.between(start, end)) | (Task.due_at.between(start, end))
        )

    if q:
        query = query.filter(Task.title.ilike(f"%{q}%"))

    items = (
        query.order_by(Task.status.asc(), Task.start_at.asc().nullslast(), Task.due_at.asc().nullslast(), Task.created_at.desc())
        .limit(400)
        .all()
    )
    for t in items:
        _ = t.reminders
    return {"items": [task_to_dto(t) for t in items]}

@router.post("")
def create_task(payload: TaskCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    t = Task(
        user_id=user.id,
        title=payload.title,
        description=payload.description,
        status=TaskStatus.TODO,
        priority=payload.priority or 3,
        quadrant=TaskQuadrant(payload.quadrant) if payload.quadrant else None,
        start_at=parse_iso_to_naive(payload.startAt),
        due_at=parse_iso_to_naive(payload.dueAt),
        duration_min=payload.durationMin or 45,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    _ = t.reminders
    return {"item": task_to_dto(t)}

@router.patch("/{task_id}")
def update_task(task_id: str, payload: TaskUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    t: Task | None = db.query(Task).filter(Task.id == task_id, Task.user_id == user.id).first()
    if not t:
        raise HTTPException(status_code=404, detail="NOT_FOUND")

    if payload.title is not None:
        t.title = payload.title
    if payload.description is not None:
        t.description = payload.description
    if payload.status is not None:
        t.status = TaskStatus(payload.status)
    if payload.priority is not None:
        t.priority = payload.priority

    if "quadrant" in payload.model_fields_set:
        if payload.quadrant is None:
            t.quadrant = None
        else:
            t.quadrant = TaskQuadrant(payload.quadrant)

    if "startAt" in payload.model_fields_set:
        if payload.startAt is None:
            t.start_at = None
        else:
            t.start_at = parse_iso_to_naive(payload.startAt)

    if "dueAt" in payload.model_fields_set:
        if payload.dueAt is None:
            t.due_at = None
        else:
            t.due_at = parse_iso_to_naive(payload.dueAt)

    if payload.durationMin is not None:
        t.duration_min = payload.durationMin

    db.add(t)
    db.commit()
    db.refresh(t)
    _ = t.reminders
    return {"item": task_to_dto(t)}

@router.delete("/{task_id}")
def delete_task(task_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    t: Task | None = db.query(Task).filter(Task.id == task_id, Task.user_id == user.id).first()
    if not t:
        raise HTTPException(status_code=404, detail="NOT_FOUND")
    db.delete(t)
    db.commit()
    return {"ok": True}
