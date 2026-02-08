from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional, List, Literal
from sqlalchemy.orm import Session, joinedload
from datetime import datetime
from ..auth_dep import get_current_user
from ..db import get_db
from ..models import User, Task, TaskStatus, TaskQuadrant, TaskTag, Tag, Project, Reminder, ReminderStatus
from ..utils import day_range, to_iso

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000)
    status: Optional[Literal["TODO","DONE","ARCHIVED"]] = None
    priority: Optional[int] = Field(default=None, ge=1, le=4)
    quadrant: Optional[Literal[
        "Q1_URGENT_IMPORTANT",
        "Q2_NOT_URGENT_IMPORTANT",
        "Q3_URGENT_NOT_IMPORTANT",
        "Q4_NOT_URGENT_NOT_IMPORTANT"
    ]] = None
    startAt: Optional[str] = None  # ISO or null-like
    dueAt: Optional[str] = None
    durationMin: Optional[int] = Field(default=None, ge=5, le=1440)
    projectId: Optional[str] = None
    tagIds: Optional[List[str]] = None

class TaskUpdate(TaskCreate):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)

def task_to_dto(db: Session, t: Task):
    project = None
    if t.project:
        project = {"id": t.project.id, "name": t.project.name, "color": t.project.color}
    tags = [{"id": tt.tag.id, "name": tt.tag.name, "color": tt.tag.color} for tt in t.task_tags]
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
        "project": project,
        "tags": tags,
        "nextReminderAt": next_rem
    }

@router.get("")
def list_tasks(
    status: Optional[Literal["TODO","DONE","ARCHIVED"]] = Query(default=None),
    date: Optional[str] = Query(default=None),        # YYYY-MM-DD
    from_: Optional[str] = Query(default=None, alias="from"),  # ISO
    to: Optional[str] = Query(default=None),          # ISO
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    q = db.query(Task).filter(Task.user_id == user.id)

    if status:
        q = q.filter(Task.status == TaskStatus(status))

    if date:
        start, end = day_range(date)
        q = q.filter(
            (Task.start_at.between(start, end)) | (Task.due_at.between(start, end))
        )

    if from_ and to:
        start = datetime.fromisoformat(from_.replace("Z","+00:00")).replace(tzinfo=None)
        end = datetime.fromisoformat(to.replace("Z","+00:00")).replace(tzinfo=None)
        q = q.filter(
            (Task.start_at.between(start, end)) | (Task.due_at.between(start, end))
        )

    items = (
        q.options(
            joinedload(Task.project),
            joinedload(Task.task_tags).joinedload(TaskTag.tag),
            joinedload(Task.reminders),
        )
        .order_by(Task.status.asc(), Task.start_at.asc().nullslast(), Task.due_at.asc().nullslast(), Task.created_at.desc())
        .all()
    )

    return {"items": [task_to_dto(db, t) for t in items]}

@router.post("")
def create_task(payload: TaskCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    t = Task(
        user_id=user.id,
        title=payload.title,
        description=payload.description,
        status=TaskStatus(payload.status) if payload.status else TaskStatus.TODO,
        priority=payload.priority if payload.priority else 3,
        quadrant=TaskQuadrant(payload.quadrant) if payload.quadrant else None,
        start_at=datetime.fromisoformat(payload.startAt.replace("Z","+00:00")).replace(tzinfo=None) if payload.startAt else None,
        due_at=datetime.fromisoformat(payload.dueAt.replace("Z","+00:00")).replace(tzinfo=None) if payload.dueAt else None,
        duration_min=payload.durationMin,
        project_id=payload.projectId,
    )
    db.add(t)
    db.commit()
    db.refresh(t)

    if payload.tagIds:
        for tag_id in payload.tagIds:
            # ensure tag belongs to user
            tag = db.query(Tag).filter(Tag.id == tag_id, Tag.user_id == user.id).first()
            if tag:
                db.add(TaskTag(task_id=t.id, tag_id=tag.id))
        db.commit()

    t = db.query(Task).filter(Task.id == t.id).options(
        joinedload(Task.project),
        joinedload(Task.task_tags).joinedload(TaskTag.tag),
        joinedload(Task.reminders),
    ).one()

    return {"item": task_to_dto(db, t)}

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
    if payload.quadrant is not None:
        t.quadrant = TaskQuadrant(payload.quadrant)
    if payload.projectId is not None:
        t.project_id = payload.projectId

    # startAt/dueAt: allow explicit null by sending null in JSON; vanilla JS will send null
    if "startAt" in payload.model_fields_set:
        if payload.startAt is None:
            t.start_at = None
        else:
            t.start_at = datetime.fromisoformat(payload.startAt.replace("Z","+00:00")).replace(tzinfo=None)

    if "dueAt" in payload.model_fields_set:
        if payload.dueAt is None:
            t.due_at = None
        else:
            t.due_at = datetime.fromisoformat(payload.dueAt.replace("Z","+00:00")).replace(tzinfo=None)

    if payload.durationMin is not None:
        t.duration_min = payload.durationMin

    # tags replace
    if payload.tagIds is not None:
        db.query(TaskTag).filter(TaskTag.task_id == t.id).delete()
        for tag_id in payload.tagIds:
            tag = db.query(Tag).filter(Tag.id == tag_id, Tag.user_id == user.id).first()
            if tag:
                db.add(TaskTag(task_id=t.id, tag_id=tag.id))

    db.add(t)
    db.commit()

    t = db.query(Task).filter(Task.id == t.id).options(
        joinedload(Task.project),
        joinedload(Task.task_tags).joinedload(TaskTag.tag),
        joinedload(Task.reminders),
    ).one()

    return {"item": task_to_dto(db, t)}

@router.delete("/{task_id}")
def delete_task(task_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    t: Task | None = db.query(Task).filter(Task.id == task_id, Task.user_id == user.id).first()
    if not t:
        raise HTTPException(status_code=404, detail="NOT_FOUND")
    db.delete(t)
    db.commit()
    return {"ok": True}
