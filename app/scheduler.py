from apscheduler.schedulers.asyncio import AsyncIOScheduler
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from .db import get_sessionmaker
from .models import Reminder, ReminderStatus
from .telegram_send import send_message
from .settings import settings

scheduler = AsyncIOScheduler()

async def dispatch_reminders():
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    SessionLocal = get_sessionmaker()
    db: Session = SessionLocal()
    try:
        due = (
            db.query(Reminder)
            .filter(Reminder.status == ReminderStatus.PENDING)
            .filter(Reminder.remind_at <= now)
            .limit(50)
            .all()
        )
        for r in due:
            try:
                await send_message(str(r.user.tg_id), f"⏰ Напоминание: {r.task.title}")
                r.status = ReminderStatus.SENT
                r.sent_at = now
                db.add(r)
                db.commit()
            except Exception:
                db.rollback()
    finally:
        db.close()

def start_scheduler():
    scheduler.add_job(dispatch_reminders, "interval", seconds=30, max_instances=1, coalesce=True)
    scheduler.start()
