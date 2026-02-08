from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from ..auth_dep import get_current_user
from ..db import get_db
from ..models import User, Task, TaskStatus

router = APIRouter(prefix="/api/stats", tags=["stats"])

@router.get("")
def stats(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    todo = db.query(Task).filter(Task.user_id == user.id, Task.status == TaskStatus.TODO).count()
    done = db.query(Task).filter(Task.user_id == user.id, Task.status == TaskStatus.DONE).count()

    start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)
    today = db.query(Task).filter(
        Task.user_id == user.id,
        Task.status == TaskStatus.TODO,
        ((Task.due_at >= start) & (Task.due_at < end)) | ((Task.start_at >= start) & (Task.start_at < end))
    ).count()

    return {"todo": todo, "done": done, "today": today}
