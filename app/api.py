from datetime import datetime, date, timedelta, timezone
from zoneinfo import ZoneInfo
import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from .db import get_db
from .models import User, Task, Event, Project
from .schemas import (
    AuthIn, AuthOut,
    TaskCreate, TaskUpdate, TaskOut,
    EventCreate, EventUpdate, EventOut,
    PlanTaskIn,
    ProjectCreate, ProjectOut,
    UserTimezoneIn
)
from .telegram_auth import validate_init_data
from .security import create_token
from .deps import get_current_user

router = APIRouter(prefix="/api")

@router.post("/auth/telegram", response_model=AuthOut)
def auth_telegram(payload: AuthIn, db: Session = Depends(get_db)):
    bot_token = os.getenv("BOT_TOKEN", "")
    if not bot_token:
        raise HTTPException(status_code=500, detail="BOT_TOKEN not set")

    parsed = validate_init_data(payload.init_data, bot_token)
    if not parsed or "user" not in parsed or not isinstance(parsed["user"], dict):
        raise HTTPException(status_code=401, detail="Invalid initData")

    u = parsed["user"]
    telegram_id = int(u.get("id"))
    first_name = u.get("first_name")
    username = u.get("username")

    user = db.query(User).filter(User.telegram_id == telegram_id).first()
    if not user:
        user = User(telegram_id=telegram_id, first_name=first_name, username=username, timezone="UTC")
        db.add(user)
        db.commit()
        db.refresh(user)

        # Create a couple default projects
        defaults = [
            ("Work", "#6EA8FF"),
            ("Health", "#7CC7FF"),
            ("Home", "#9BE7A2"),
        ]
        for name, color in defaults:
            db.add(Project(user_id=user.id, name=name, color=color))
        db.commit()

    token = create_token(user.id)
    return {"token": token, "user": {"id": user.id, "telegram_id": user.telegram_id, "first_name": user.first_name, "username": user.username}}

def _to_utc_naive(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


@router.patch("/user/timezone")
def set_user_timezone(body: UserTimezoneIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        ZoneInfo(body.timezone)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid timezone")
    user.timezone = body.timezone
    db.commit()
    return {"ok": True, "timezone": user.timezone}

# ---- Projects ----
@router.get("/projects", response_model=list[ProjectOut])
def list_projects(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Project).filter(Project.user_id == user.id).order_by(Project.name.asc()).all()

@router.post("/projects", response_model=ProjectOut)
def create_project(body: ProjectCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = Project(user_id=user.id, name=body.name, color=body.color)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p

# ---- Tasks ----
def _task_to_out(t: Task) -> dict:
    proj = None
    if t.project:
        proj = {"id": t.project.id, "name": t.project.name, "color": t.project.color}
    return {
        "id": t.id,
        "title": t.title,
        "notes": t.notes,
        "status": t.status,
        "priority": t.priority,
        "due_date": t.due_date,
        "estimate_min": t.estimate_min,
        "project": proj
    }

@router.get("/tasks", response_model=list[TaskOut])
def list_tasks(filter: str = "inbox", user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = db.query(Task).options(joinedload(Task.project)).filter(Task.user_id == user.id)

    today = datetime.now(ZoneInfo(user.timezone or "UTC")).date()
    if filter == "inbox":
        q = q.filter(Task.status == "inbox")
    elif filter == "today":
        q = q.filter((Task.due_date == today) | (Task.status == "planned"))
    elif filter == "upcoming":
        q = q.filter(Task.due_date != None).order_by(Task.due_date.asc())
    elif filter.startswith("project:"):
        pid = int(filter.split(":",1)[1])
        q = q.filter(Task.project_id == pid)
    else:
        q = q.order_by(Task.created_at.desc())

    tasks = q.order_by(Task.priority.asc(), Task.created_at.desc()).all()
    return [_task_to_out(t) for t in tasks]

@router.post("/tasks", response_model=TaskOut)
def create_task(body: TaskCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    t = Task(
        user_id=user.id,
        title=body.title,
        notes=body.notes,
        priority=body.priority,
        due_date=body.due_date,
        estimate_min=body.estimate_min,
        project_id=body.project_id
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    t = db.query(Task).options(joinedload(Task.project)).get(t.id)
    return _task_to_out(t)

@router.patch("/tasks/{task_id}", response_model=TaskOut)
def update_task(task_id: int, body: TaskUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    t = db.query(Task).filter(Task.user_id == user.id, Task.id == task_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")

    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(t, k, v)
    t.updated_at = datetime.utcnow()
    db.commit()
    t = db.query(Task).options(joinedload(Task.project)).get(t.id)
    return _task_to_out(t)

@router.post("/tasks/{task_id}/complete")
def complete_task(task_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    t = db.query(Task).filter(Task.user_id == user.id, Task.id == task_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    t.status = "done"
    t.updated_at = datetime.utcnow()
    db.commit()
    return {"ok": True}

@router.delete("/tasks/{task_id}")
def delete_task(task_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    t = db.query(Task).filter(Task.user_id == user.id, Task.id == task_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    db.delete(t)
    db.commit()
    return {"ok": True}

# ---- Events / Schedule ----

@router.get("/schedule/range", response_model=list[EventOut])
def schedule_range(start_date: str, end_date: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return events in [start_date, end_date] inclusive, interpreted in user's timezone."""
    try:
        d1 = date.fromisoformat(start_date)
        d2 = date.fromisoformat(end_date)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid date")
    if d2 < d1:
        raise HTTPException(status_code=400, detail="Invalid range")

    tz = ZoneInfo(user.timezone or "UTC")
    start_local = datetime(d1.year, d1.month, d1.day, tzinfo=tz)
    end_local = datetime(d2.year, d2.month, d2.day, tzinfo=tz) + timedelta(days=1)

    start = start_local.astimezone(timezone.utc).replace(tzinfo=None)
    end = end_local.astimezone(timezone.utc).replace(tzinfo=None)

    evs = (
        db.query(Event)
        .filter(Event.user_id == user.id, Event.is_deleted == False)
        .filter(Event.start_dt >= start, Event.start_dt < end)
        .order_by(Event.start_dt.asc())
        .all()
    )
    return evs

@router.get("/schedule/day", response_model=list[EventOut])
def schedule_day(date_str: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        d = date.fromisoformat(date_str)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid date")
    start = datetime(d.year, d.month, d.day)
    end = start + timedelta(days=1)

    evs = (
        db.query(Event)
        .filter(Event.user_id == user.id, Event.is_deleted == False)
        .filter(Event.start_dt >= start, Event.start_dt < end)
        .order_by(Event.start_dt.asc())
        .all()
    )
    return evs

@router.post("/events", response_model=EventOut)
def create_event(body: EventCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ev = Event(
        user_id=user.id,
        title=body.title,
        start_dt=_to_utc_naive(body.start_dt),
        end_dt=_to_utc_naive(body.end_dt),
        color=body.color,
        source=body.source,
        task_id=body.task_id
    )
    db.add(ev)
    db.commit()
    db.refresh(ev)

    # If this event is from a task — mark task as planned
    if body.task_id:
        t = db.query(Task).filter(Task.user_id == user.id, Task.id == body.task_id).first()
        if t and t.status != "done":
            t.status = "planned"
            t.updated_at = datetime.utcnow()
            db.commit()

    return ev

@router.patch("/events/{event_id}", response_model=EventOut)
def update_event(event_id: int, body: EventUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ev = db.query(Event).filter(Event.user_id == user.id, Event.id == event_id, Event.is_deleted == False).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        if k in ("start_dt", "end_dt") and v is not None:
            v = _to_utc_naive(v)
        setattr(ev, k, v)
    db.commit()
    db.refresh(ev)
    return ev

@router.delete("/events/{event_id}")
def delete_event(event_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ev = db.query(Event).filter(Event.user_id == user.id, Event.id == event_id, Event.is_deleted == False).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")
    ev.is_deleted = True
    db.commit()
    return {"ok": True}

@router.post("/tasks/{task_id}/plan", response_model=EventOut)
def plan_task(task_id: int, body: PlanTaskIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    t = db.query(Task).options(joinedload(Task.project)).filter(Task.user_id == user.id, Task.id == task_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")

    color = t.project.color if t.project else "#6EA8FF"
    ev = Event(
        user_id=user.id,
        title=t.title,
        start_dt=_to_utc_naive(body.start_dt),
        end_dt=_to_utc_naive(body.start_dt) + timedelta(minutes=body.duration_min),
        color=color,
        source="task",
        task_id=t.id
    )
    db.add(ev)
    t.status = "planned" if t.status != "done" else t.status
    db.commit()
    db.refresh(ev)
    return ev
