import os
import logging
from datetime import datetime
from typing import Optional, List

from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from sqlalchemy.orm import Session

# Локальные импорты из папки app/
from .database import Base, engine, SessionLocal
from .models import Task

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("taskflow")

app = FastAPI(title="TaskFlow API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(BASE_DIR, "web")


# ---------------- DB ----------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.on_event("startup")
async def on_startup():
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("✅ DB tables ready")
    except Exception as e:
        logger.error(f"❌ DB init error: {e}")


# ---------------- Health ----------------
@app.get("/health")
async def health():
    return {"status": "ok", "ts": datetime.utcnow().isoformat()}


@app.get("/api")
async def api_status():
    return {"status": "ok", "message": "API is working"}


# ---------------- Helpers ----------------
def parse_iso_datetime(value: Optional[str]):
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


# ---------------- Schemas ----------------
class TaskOut(BaseModel):
    id: int
    user_id: int
    title: str
    description: str
    priority: str
    due_at: Optional[str]
    completed: bool
    reminder_sent: bool
    created_at: Optional[str]
    updated_at: Optional[str]


class TaskCreate(BaseModel):
    user_id: int
    title: str = Field(..., min_length=1, max_length=200)
    description: str = Field("", max_length=500)
    priority: str = Field("medium")
    due_at: Optional[str] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=500)
    priority: Optional[str] = None
    due_at: Optional[str] = None
    completed: Optional[bool] = None


def to_out(t: Task) -> TaskOut:
    return TaskOut(
        id=t.id,
        user_id=t.user_id,
        title=t.title,
        description=t.description or "",
        priority=(t.priority or "medium"),
        due_at=iso(t.due_at),
        completed=bool(t.completed),
        reminder_sent=bool(getattr(t, "reminder_sent", False)),
        created_at=iso(getattr(t, "created_at", None)),
        updated_at=iso(getattr(t, "updated_at", None)),
    )


# ---------------- API: Tasks ----------------
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

    if payload.title is not None:
        t.title = payload.title.strip()

    if payload.description is not None:
        t.description = (payload.description or "").strip()

    if payload.priority is not None:
        pr = (payload.priority or "medium").lower().strip()
        t.priority = pr if pr in ["high", "medium", "low"] else "medium"

    if payload.due_at is not None:
        t.due_at = parse_iso_datetime(payload.due_at) if payload.due_at else None
        # если изменили срок — напоминание надо слать заново
        t.reminder_sent = False

    if payload.completed is not None:
        t.completed = bool(payload.completed)
        if not t.completed:
            t.reminder_sent = False

    db.commit()
    db.refresh(t)
    return to_out(t)


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


# ---------------- WEB ----------------
@app.get("/")
async def serve_index():
    index_path = os.path.join(WEB_DIR, "index.html")
    if not os.path.exists(index_path):
        raise HTTPException(status_code=404, detail="index.html not found")
    return FileResponse(index_path)


# ВАЖНО: раздаём web-файлы НЕ на "/", чтобы не ломать /api/*
# если понадобятся /app.js, /style.css, /manifest.json — будут доступны как /static/...
if os.path.exists(WEB_DIR):
    app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")
else:
    logger.warning(f"⚠️ Web directory not found: {WEB_DIR}")


@app.exception_handler(Exception)
async def any_error(request: Request, exc: Exception):
    logger.error(f"❌ Unhandled error: {exc}")
    return JSONResponse(status_code=500, content={"success": False, "error": "Internal server error"})
