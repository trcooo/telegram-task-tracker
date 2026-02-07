import os
import sys
import logging
from datetime import datetime
from typing import Optional, List

# Добавляем текущую директорию в путь
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, current_dir)

from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel, Field

# Настройка логирования ДО всего
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Создаем приложение
app = FastAPI(title="Task Tracker API", version="2.0.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------- Health check - ПЕРВЫЙ! -----------------
@app.get("/health")
async def health_check():
    """Проверка работоспособности сервиса"""
    logger.info("Health check called")
    return JSONResponse(
        status_code=200,
        content={
            "status": "healthy",
            "service": "task-tracker-api",
            "timestamp": datetime.utcnow().isoformat(),
            "version": "2.0.0"
        }
    )


# Попробуем импортировать базу данных с обработкой ошибок
try:
    from database import Base, engine, SessionLocal
    from sqlalchemy.orm import Session
    from models import Task

    logger.info("✅ Database module imported")

    # Создаем таблицы при запуске
    @app.on_event("startup")
    async def startup_event():
        try:
            Base.metadata.create_all(bind=engine)
            logger.info("✅ Database tables created")
        except Exception as e:
            logger.error(f"❌ Error creating tables: {e}")

    def get_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

except ImportError as e:
    logger.warning(f"⚠️ Database module not found: {e}")
    engine = None
    SessionLocal = None
    Task = None
    Session = None
    get_db = None


# ----------------- Static files (Mini App) -----------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(BASE_DIR, "web")

if os.path.exists(WEB_DIR):
    logger.info(f"📁 Serving static files from: {WEB_DIR}")
    app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
else:
    logger.warning(f"⚠️ Web directory not found: {WEB_DIR}")


# Главная страница
@app.get("/")
async def serve_index():
    """Главная страница Mini App"""
    index_path = os.path.join(WEB_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)

    html_content = """<!DOCTYPE html>
<html>
<head>
  <title>Task Tracker</title>
  <meta charset=\"UTF-8\">
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">
</head>
<body>
  <h2>Task Tracker</h2>
  <p>Файлы Mini App не найдены в папке <code>web/</code>.</p>
</body>
</html>"""

    return JSONResponse(status_code=200, content={"html": html_content})


# ----------------- Helper: ISO parsing -----------------
def parse_iso_datetime(value: Optional[str]):
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    # frontend sends "...Z"
    if s.endswith("Z"):
        s = s[:-1]
    try:
        return datetime.fromisoformat(s)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid datetime format (ISO expected)")


# ----------------- Schemas -----------------
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


def to_out(t) -> TaskOut:
    return TaskOut(
        id=t.id,
        user_id=t.user_id,
        title=t.title,
        description=t.description or "",
        priority=t.priority or "medium",
        due_at=t.due_at.isoformat() if getattr(t, "due_at", None) else None,
        completed=bool(t.completed),
        reminder_sent=bool(getattr(t, "reminder_sent", False)),
        created_at=t.created_at.isoformat() if getattr(t, "created_at", None) else None,
        updated_at=t.updated_at.isoformat() if getattr(t, "updated_at", None) else None,
    )


# ----------------- API -----------------
@app.get("/api")
async def api_status():
    return {"status": "ok", "message": "API is working"}


@app.get("/api/tasks/{user_id}", response_model=List[TaskOut])
async def get_tasks(user_id: int, db=Depends(get_db)):
    if not db or not Task:
        raise HTTPException(status_code=500, detail="Database not configured")

    tasks = (
        db.query(Task)
        .filter(Task.user_id == user_id)
        .order_by(Task.completed.asc(), Task.due_at.is_(None).asc(), Task.due_at.asc(), Task.id.desc())
        .all()
    )
    return [to_out(t) for t in tasks]


@app.post("/api/tasks", response_model=TaskOut)
async def create_task(payload: TaskCreate, db=Depends(get_db)):
    if not db or not Task:
        raise HTTPException(status_code=500, detail="Database not configured")

    pr = (payload.priority or "medium").lower().strip()
    if pr not in ("high", "medium", "low"):
        pr = "medium"

    t = Task(
        user_id=payload.user_id,
        title=payload.title.strip(),
        description=(payload.description or "").strip(),
        priority=pr,
        due_at=parse_iso_datetime(payload.due_at),
        completed=False,
        reminder_sent=False
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return to_out(t)


@app.put("/api/tasks/{task_id}", response_model=TaskOut)
async def update_task(task_id: int, payload: TaskUpdate, db=Depends(get_db)):
    if not db or not Task:
        raise HTTPException(status_code=500, detail="Database not configured")

    t = db.query(Task).filter(Task.id == task_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")

    if payload.title is not None:
        t.title = payload.title.strip()

    if payload.description is not None:
        t.description = (payload.description or "").strip()

    if payload.priority is not None:
        pr = payload.priority.lower().strip()
        t.priority = pr if pr in ("high", "medium", "low") else "medium"

    if payload.due_at is not None:
        t.due_at = parse_iso_datetime(payload.due_at) if payload.due_at else None
        # срок изменили => напоминание нужно переслать заново
        t.reminder_sent = False

    if payload.completed is not None:
        t.completed = bool(payload.completed)
        if not t.completed:
            t.reminder_sent = False

    db.commit()
    db.refresh(t)
    return to_out(t)


@app.delete("/api/tasks/{task_id}")
async def delete_task(task_id: int, db=Depends(get_db)):
    if not db or not Task:
        raise HTTPException(status_code=500, detail="Database not configured")

    t = db.query(Task).filter(Task.id == task_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    db.delete(t)
    db.commit()
    return {"success": True}


@app.post("/api/tasks/{task_id}/done")
async def mark_done(task_id: int, db=Depends(get_db)):
    if not db or not Task:
        raise HTTPException(status_code=500, detail="Database not configured")

    t = db.query(Task).filter(Task.id == task_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    t.completed = True
    db.commit()
    return {"success": True}


@app.post("/api/tasks/{task_id}/undone")
async def mark_undone(task_id: int, db=Depends(get_db)):
    if not db or not Task:
        raise HTTPException(status_code=500, detail="Database not configured")

    t = db.query(Task).filter(Task.id == task_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    t.completed = False
    t.reminder_sent = False
    db.commit()
    return {"success": True}


# Обработчик ошибок
@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger.error(f"❌ Unhandled error: {exc}")
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": "Internal server error"
        }
    )


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "0.0.0.0")

    logger.info(f"🚀 Starting server on {host}:{port}")
    uvicorn.run(app, host=host, port=port, log_level="info")
