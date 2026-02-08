from apscheduler.schedulers.asyncio import AsyncIOScheduler
from datetime import datetime, timezone
import logging

from sqlalchemy.orm import Session
from sqlalchemy.exc import OperationalError

from .db import get_sessionmaker
from .models import Reminder, ReminderStatus
from .telegram_send import send_message

log = logging.getLogger("tg_planner.scheduler")

scheduler = AsyncIOScheduler()

async def dispatch_reminders():
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    try:
        SessionLocal = get_sessionmaker()
        db: Session = SessionLocal()
    except Exception as e:
        log.warning("Scheduler: DB session init failed: %s", e)
        return

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
    except OperationalError as e:
        log.warning("Scheduler: DB unavailable: %s", e)
    except Exception as e:
        log.exception("Scheduler: unexpected error: %s", e)
    finally:
        try:
            db.close()
        except Exception:
            pass

def start_scheduler():
    scheduler.add_job(dispatch_reminders, "interval", seconds=30, max_instances=1, coalesce=True)
    scheduler.start()
