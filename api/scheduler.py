import os
from apscheduler.schedulers.background import BackgroundScheduler
from datetime import datetime, timezone
from sqlalchemy.orm import Session
import requests

from .db import SessionLocal
from .models import Reminder, Task

BOT_TOKEN = os.getenv("BOT_TOKEN", "")
TG_API = f"https://api.telegram.org/bot{BOT_TOKEN}"

_scheduler = None

def start_scheduler():
    global _scheduler
    if _scheduler:
        return
    _scheduler = BackgroundScheduler(timezone="UTC")
    _scheduler.add_job(_tick, "interval", seconds=30, id="reminders_tick", max_instances=1, coalesce=True)
    _scheduler.start()

def _tick():
    if not BOT_TOKEN:
        return
    db: Session = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        # fetch due reminders
        due = (
            db.query(Reminder)
            .join(Task)
            .filter(Reminder.status.in_(["scheduled", "snoozed"]))
            .filter(Reminder.at <= now)
            .all()
        )
        for r in due:
            task = r.task
            _send(task.user_id, f"⏰ {task.title}")
            r.status = "sent"
        if due:
            db.commit()
    finally:
        db.close()

def _send(chat_id: str, text: str):
    try:
        requests.post(f"{TG_API}/sendMessage", json={"chat_id": chat_id, "text": text}, timeout=5)
    except Exception:
        pass
