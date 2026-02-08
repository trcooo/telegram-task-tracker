from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional, Literal
from sqlalchemy.orm import Session, joinedload
from datetime import datetime, timedelta
from ..auth_dep import get_current_user
from ..db import get_db
from ..models import User, Reminder, ReminderStatus, Task
from ..utils import to_iso

router = APIRouter(prefix="/api/reminders", tags=["reminders"])

class ReminderCreate(BaseModel):
    taskId: str
    remindAt: str  # ISO

class SnoozeIn(BaseModel):
    minutes: int = Field(ge=1, le=24*60)

@router.get("")
def list_reminders(
    status: Optional[Literal["PENDING","SENT","CANCELED"]] = Query(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Reminder).filter(Reminder.user_id == user.id).options(joinedload(Reminder.task))
    if status:
        q = q.filter(Reminder.status == ReminderStatus(status))
    items = q.order_by(Reminder.status.asc(), Reminder.remind_at.asc()).limit(200).all()
    return {
        "items": [{
            "id": r.id,
            "taskId": r.task_id,
            "taskTitle": r.task.title,
            "remindAt": to_iso(r.remind_at),
            "status": r.status.value
        } for r in items]
    }

@router.post("")
def create_reminder(payload: ReminderCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    t = db.query(Task).filter(Task.id == payload.taskId, Task.user_id == user.id).first()
    if not t:
        raise HTTPException(status_code=404, detail="TASK_NOT_FOUND")

    remind_at = datetime.fromisoformat(payload.remindAt.replace("Z","+00:00")).replace(tzinfo=None)
    r = Reminder(user_id=user.id, task_id=t.id, remind_at=remind_at, status=ReminderStatus.PENDING)
    db.add(r)
    db.commit()
    db.refresh(r)
    return {
        "item": {
            "id": r.id,
            "taskId": r.task_id,
            "taskTitle": t.title,
            "remindAt": to_iso(r.remind_at),
            "status": r.status.value
        }
    }

@router.post("/{reminder_id}/snooze")
def snooze(reminder_id: str, payload: SnoozeIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = db.query(Reminder).filter(Reminder.id == reminder_id, Reminder.user_id == user.id).first()
    if not r:
        raise HTTPException(status_code=404, detail="NOT_FOUND")
    if r.status != ReminderStatus.PENDING:
        raise HTTPException(status_code=400, detail="NOT_PENDING")

    r.remind_at = r.remind_at + timedelta(minutes=payload.minutes)
    db.add(r)
    db.commit()
    db.refresh(r)
    return {"item": {"id": r.id, "taskId": r.task_id, "remindAt": to_iso(r.remind_at), "status": r.status.value}}

@router.post("/{reminder_id}/cancel")
def cancel(reminder_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = db.query(Reminder).filter(Reminder.id == reminder_id, Reminder.user_id == user.id).first()
    if not r:
        raise HTTPException(status_code=404, detail="NOT_FOUND")
    r.status = ReminderStatus.CANCELED
    db.add(r)
    db.commit()
    return {"ok": True, "item": {"id": r.id, "status": r.status.value}}

@router.post("/task/{task_id}/quick")
def quick(task_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    t = db.query(Task).filter(Task.id == task_id, Task.user_id == user.id).first()
    if not t:
        raise HTTPException(status_code=404, detail="TASK_NOT_FOUND")

    remind_at = datetime.utcnow() + timedelta(minutes=10)
    r = Reminder(user_id=user.id, task_id=t.id, remind_at=remind_at, status=ReminderStatus.PENDING)
    db.add(r)
    db.commit()
    db.refresh(r)

    return {
        "item": {
            "id": r.id,
            "taskId": r.task_id,
            "taskTitle": t.title,
            "remindAt": to_iso(r.remind_at),
            "status": r.status.value
        }
    }
