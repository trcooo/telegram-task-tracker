import os
import logging
from datetime import datetime
from typing import Optional, List

from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .database import Base, engine, SessionLocal
from .models import Task

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("taskflow")

app = FastAPI(title="TaskFlow API", version="2.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "ok", "ts": datetime.utcnow().isoformat()}

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.on_event("startup")
async def on_startup():
    Base.metadata.create_all(bind=engine)
    logger.info("DB ready")

WEB_DIR = os.path.join(os.path.dirname(__file__), "web")
if os.path.isdir(WEB_DIR):
    app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")

def parse_iso(value: Optional[str]) -> Optional[datetime]:
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
        raise HTTPException(status_code=400, detail="Invalid datetime format")

class TaskOut(BaseModel):
    id: int
    user_id: int
    title: str
    description: str
    priority: str
    due_at: Optional[str]
    completed: bool
    reminder_sent: bool
    created_at: str
    updated_at: str

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
        priority=t.priority,
        due_at=t.due_at.isoformat() if t.due_at else None,
        completed=bool(t.completed),
        reminder_sent=bool(t.reminder_sent),
        created_at=t.created_at.isoformat() if t.created_at else "",
        updated_at=t.updated_at.isoformat() if t.updated_at else "",
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
    if pr not in ("high","medium","low"):
        pr = "medium"
    t = Task(
        user_id=payload.user_id,
        title=payload.title.strip(),
        description=(payload.description or "").strip(),
        priority=pr,
        due_at=parse_iso(payload.due_at),
        completed=False,
        reminder_sent=False
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
        t.priority = pr if pr in ("high","medium","low") else "medium"
    if payload.due_at is not None:
        t.due_at = parse_iso(payload.due_at) if payload.due_at else None
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

@app.exception_handler(Exception)
async def handle_exc(request: Request, exc: Exception):
    logger.error(f"Unhandled: {exc}")
    return JSONResponse(status_code=500, content={"success": False, "error": "Internal server error"})
