from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List as TList, Optional
from datetime import datetime, timedelta

from ..deps import get_db, get_current_user
from ..models import Reminder, Task
from ..schemas import ReminderCreate, ReminderOut

router = APIRouter()

@router.get("", response_model=TList[ReminderOut])
def list_reminders(
    status: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    user_and_jwt=Depends(get_current_user),
):
    user, _ = user_and_jwt
    q = db.query(Reminder).join(Task).filter(Task.user_id == user.id)
    if status:
        q = q.filter(Reminder.status == status)
    return q.order_by(Reminder.at.asc()).all()

@router.post("/task/{task_id}", response_model=ReminderOut)
def create_reminder(task_id: int, payload: ReminderCreate, db: Session = Depends(get_db), user_and_jwt=Depends(get_current_user)):
    user, _ = user_and_jwt
    t = db.get(Task, task_id)
    if not t or t.user_id != user.id:
        raise HTTPException(status_code=404, detail="task not found")
    r = Reminder(task_id=t.id, at=payload.at, method="telegram", status="scheduled")
    db.add(r)
    db.commit()
    db.refresh(r)
    return r

@router.post("/{reminder_id}/snooze", response_model=ReminderOut)
def snooze(reminder_id: int, minutes: int = Query(default=10), db: Session = Depends(get_db), user_and_jwt=Depends(get_current_user)):
    user, _ = user_and_jwt
    r = db.get(Reminder, reminder_id)
    if not r:
        raise HTTPException(status_code=404, detail="reminder not found")
    # ownership via task
    if r.task.user_id != user.id:
        raise HTTPException(status_code=403, detail="forbidden")
    r.at = r.at + timedelta(minutes=minutes)
    r.status = "snoozed"
    db.commit()
    db.refresh(r)
    return r
