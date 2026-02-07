import os
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .database import Base, engine, SessionLocal
from .models import Task

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("taskflow")

app = FastAPI(title="TaskFlow API", version="3.1.0")


# --- Disable caching for Telegram WebView quirks ---
BUILD_ID = "1770481524"

@app.middleware("http")
async def no_cache_middleware(request: Request, call_next):
    resp = await call_next(request)
    path = request.url.path
    if path == "/" or path.endswith(".html") or path.endswith(".js") or path.endswith(".css") or path.endswith(".png") or path.endswith("manifest.json"):
        resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        resp.headers["Pragma"] = "no-cache"
        resp.headers["Expires"] = "0"
    resp.headers["X-Build-Id"] = BUILD_ID
    return resp

@app.get("/version")
async def version():
    return {"build": BUILD_ID}



from datetime import datetime, timedelta

def _parse_utc_noz(dt_str: str):
    # Accept 'YYYY-MM-DDTHH:MM' or 'YYYY-MM-DDTHH:MM:SS'
    if not dt_str:
        return None
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M"):
        try:
            return datetime.strptime(dt_str, fmt)
        except ValueError:
            continue
    # last resort: trim milliseconds/Z if client sent ISO
    cleaned = dt_str.replace('Z','')
    if '.' in cleaned:
        cleaned = cleaned.split('.')[0]
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M"):
        try:
            return datetime.strptime(cleaned, fmt)
        except ValueError:
            continue
    raise ValueError(f"Bad due_at format: {dt_str}")

def _format_utc_noz(dt: datetime):
    return dt.strftime("%Y-%m-%dT%H:%M:%S")

def _to_local(utc_dt: datetime, tz_off_min: int) -> datetime:
    return utc_dt + timedelta(minutes=tz_off_min)

def _to_utc(local_dt: datetime, tz_off_min: int) -> datetime:
    return local_dt - timedelta(minutes=tz_off_min)

def _iter_recurrences(local_start: datetime, rule: dict, local_until_date: datetime):
    # emit local datetimes for occurrences, inclusive until date
    freq = (rule or {}).get("freq")
    interval = int((rule or {}).get("interval") or 1)
    byweekday = rule.get("byweekday") if isinstance(rule, dict) else None

    until_end = local_until_date.replace(hour=23, minute=59, second=59, microsecond=0)

    if not freq:
        return
    if freq == "daily":
        cur = local_start
        while cur <= until_end:
            yield cur
            cur = cur + timedelta(days=interval)
        return

    if freq == "weekly":
        wds = sorted(set(int(x) for x in (byweekday or [local_start.weekday()])))
        cur = local_start
        while cur <= until_end:
            if cur.weekday() in wds:
                yield cur
            cur = cur + timedelta(days=1)
        return

    if freq == "monthly":
        from calendar import monthrange
        cur = local_start
        day = local_start.day
        while cur <= until_end:
            yield cur
            y = cur.year
            m = cur.month + interval
            y += (m-1)//12
            m = (m-1)%12 + 1
            last_day = monthrange(y, m)[1]
            d = min(day, last_day)
            cur = cur.replace(year=y, month=m, day=d)
        return


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(BASE_DIR, "web")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.on_event("startup")
async def startup():
    # Create tables
    Base.metadata.create_all(bind=engine)

    # Lightweight schema migration for existing DBs (Postgres/SQLite).
    # Adds recurrence columns if they don't exist.
    try:
        with engine.begin() as conn:
            # Postgres supports IF NOT EXISTS; SQLite supports it in recent versions for ADD COLUMN.
            conn.exec_driver_sql("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS series_id VARCHAR(64)")
            conn.exec_driver_sql("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_rule TEXT")
            conn.exec_driver_sql("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_until TIMESTAMP")
    except Exception:
        # If dialect doesn't support IF NOT EXISTS, ignore.
        pass


@app.get("/health")
async def health():
    return {"status": "ok", "ts": datetime.utcnow().isoformat()}

@app.get("/api")
async def api_status():
    return {"status": "ok", "version": app.version}

def parse_iso_datetime(value: Optional[str]) -> Optional[datetime]:
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    if s.endswith("Z"):
        s = s[:-1]
    try:
        return datetime.fromisoformat(s)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid datetime format (ISO expected)")

def iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None

class TaskOut(BaseModel):
    id: int
    user_id: int
    title: str
    description: str
    priority: str
    due_at: Optional[str]
    completed: bool
    reminder_enabled: bool
    reminder_sent: bool
    created_at: Optional[str]
    updated_at: Optional[str]

class TaskCreate(BaseModel):
    user_id: int
    title: str = Field(..., min_length=1, max_length=200)
    description: str = Field("", max_length=1000)
    priority: str = Field("medium")
    due_at: Optional[str] = None
    reminder_enabled: bool = True
    tz_offset_minutes: Optional[int] = None
    recurrence: Optional[Dict] = None
    recurrence_until: Optional[str] = None

class TaskUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    priority: Optional[str] = None
    due_at: Optional[str] = None
    completed: Optional[bool] = None
    reminder_enabled: Optional[bool] = None
    tz_offset_minutes: Optional[int] = None
    recurrence: Optional[Dict] = None
    recurrence_until: Optional[str] = None

def to_out(t: Task) -> TaskOut:
    return TaskOut(
        id=t.id,
        user_id=t.user_id,
        title=t.title,
        description=t.description or "",
        priority=t.priority or "medium",
        due_at=iso(t.due_at),
        completed=bool(t.completed),
        reminder_enabled=bool(getattr(t, "reminder_enabled", True)),
        reminder_sent=bool(getattr(t, "reminder_sent", False)),
        created_at=iso(getattr(t, "created_at", None)),
        updated_at=iso(getattr(t, "updated_at", None)),
    )

@app.get("/api/tasks/{user_id}", response_model=List[TaskOut])
async def get_tasks(user_id: int, db: Session = Depends(get_db)):
    tasks = (
        db.query(Task)
        .filter(Task.user_id == user_id)
        .order_by(Task.completed.asc(), Task.due_at.is_(None).asc(), Task.due_at.asc(), Task.id.desc())
        .all()
    )
    return [to_out(t) for t in tasks]

@app.post("/api/tasks", response_model=TaskOut)
async def create_task(payload: TaskCreate, db: Session = Depends(get_db)):
    pr = (payload.priority or "medium").lower().strip()
    if pr not in ["high", "medium", "low"]:
        pr = "medium"

    t = Task(
        user_id=payload.user_id,
        title=payload.title.strip(),
        description=(payload.description or "").strip(),
        priority=pr,
        due_at=parse_iso_datetime(payload.due_at),
        completed=False,
        reminder_enabled=bool(payload.reminder_enabled),
        reminder_sent=False,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return to_out(t)

@app.put("/api/tasks/{task_id}", response_model=TaskOut)
async def update_task(task_id: int, payload: TaskUpdate, db: Session = Depends(get_db)):
    t = db.query(Task).filter(Task.id == task_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")

    changed_due = False
    reopened = False

    if payload.title is not None:
        t.title = payload.title.strip()
    if payload.description is not None:
        t.description = (payload.description or "").strip()
    if payload.priority is not None:
        pr = (payload.priority or "medium").lower().strip()
        t.priority = pr if pr in ["high", "medium", "low"] else "medium"
    if payload.due_at is not None:
        t.due_at = parse_iso_datetime(payload.due_at) if payload.due_at else None
        changed_due = True
    if payload.completed is not None:
        prev = bool(t.completed)
        t.completed = bool(payload.completed)
        reopened = prev and not t.completed
    if payload.reminder_enabled is not None:
        t.reminder_enabled = bool(payload.reminder_enabled)

    if changed_due or reopened:
        t.reminder_sent = False

    db.commit()
    db.refresh(t)
    return to_out(t)


class MigrateUser(BaseModel):
    from_user_id: int
    to_user_id: int

@app.post("/api/migrate_user")
async def migrate_user(payload: MigrateUser, db: Session = Depends(get_db)):
    """Перенос задач со старого user_id на новый (например, если раньше работали в браузере с user_id=1)."""
    if payload.from_user_id == payload.to_user_id:
        return {"success": True, "migrated": 0}
    tasks_q = db.query(Task).filter(Task.user_id == payload.from_user_id)
    count = tasks_q.count()
    tasks_q.update({Task.user_id: payload.to_user_id})
    db.commit()
    return {"success": True, "migrated": count}


@app.delete("/api/tasks/{task_id}")
async def delete_task(task_id: int, db: Session = Depends(get_db)):
    t = db.query(Task).filter(Task.id == task_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    db.delete(t)
    db.commit()
    return {"success": True}

@app.post("/api/tasks/{task_id}/done")
async def mark_done(task_id: int, db: Session = Depends(get_db)):
    t = db.query(Task).filter(Task.id == task_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    t.completed = True
    db.commit()
    return {"success": True}

@app.post("/api/tasks/{task_id}/undone")
async def mark_undone(task_id: int, db: Session = Depends(get_db)):
    t = db.query(Task).filter(Task.id == task_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    t.completed = False
    t.reminder_sent = False
    db.commit()
    return {"success": True}

# optional: snooze +15 min from UI
@app.post("/api/tasks/{task_id}/snooze15", response_model=TaskOut)
async def snooze_15(task_id: int, db: Session = Depends(get_db)):
    t = db.query(Task).filter(Task.id == task_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    if not t.due_at:
        raise HTTPException(status_code=400, detail="Task has no due date")
    t.due_at = t.due_at + timedelta(minutes=15)
    t.reminder_sent = False
    db.commit()
    db.refresh(t)
    return to_out(t)

# ---------- Web ----------
@app.get("/")
async def serve_index():
    index_path = os.path.join(WEB_DIR, "index.html")
    if not os.path.exists(index_path):
        raise HTTPException(status_code=404, detail="index.html not found")
    return FileResponse(index_path)

if os.path.exists(WEB_DIR):
    app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")

# --- Static asset convenience routes (Telegram WebView sometimes fails /static/* caching) ---
@app.get("/style.css")
async def style_css():
    return FileResponse(os.path.join(WEB_DIR, "style.css"), media_type="text/css")

@app.get("/app.js")
async def app_js():
    return FileResponse(os.path.join(WEB_DIR, "app.js"), media_type="application/javascript")

@app.get("/logo.png")
async def logo_png():
    return FileResponse(os.path.join(WEB_DIR, "logo.png"), media_type="image/png")

@app.get("/manifest.json")
async def manifest_json():
    return FileResponse(os.path.join(WEB_DIR, "manifest.json"), media_type="application/json")


@app.exception_handler(Exception)
async def any_error(request: Request, exc: Exception):
    logger.exception("Unhandled error")
    return JSONResponse(status_code=500, content={"success": False, "error": "Internal server error"})
