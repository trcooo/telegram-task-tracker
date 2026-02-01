import os
import sys

# Добавляем текущую директорию в PYTHONPATH
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, HTTPException, Request, Depends, Query, Body
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse, HTMLResponse
from fastapi.security import HTTPBearer
from sqlalchemy.orm import Session
from sqlalchemy import desc, or_, and_
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Dict, Any
import logging
import json
import pytz

# Импорт локальных модулей
try:
    from .database import Base, engine, SessionLocal, get_db
    from .models import Task, User, Category, TaskHistory
    from .schemas import (
        TaskCreate, TaskUpdate, TaskResponse,
        CategoryCreate, CategoryResponse,
        UserCreate, UserResponse,
        AnalyticsResponse, TaskStats
    )

    logger = logging.getLogger(__name__)
    logger.info("✅ Все модули импортированы успешно")
except ImportError as e:
    logger = logging.getLogger(__name__)
    logger.error(f"❌ Ошибка импорта модулей: {e}")
    raise

# ----------------- Настройки -----------------
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
    ]
)

# JWT Secret
SECRET_KEY = os.getenv("JWT_SECRET", "your-secret-key-change-in-production")
security = HTTPBearer()

# ----------------- Приложение FastAPI -----------------
app = FastAPI(
    title="Task Tracker API",
    description="API для управления задачами через Telegram Mini App",
    version="2.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json"
)

# ----------------- CORS -----------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

# ----------------- Статические файлы -----------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(BASE_DIR, "web")

if os.path.exists(WEB_DIR):
    logger.info(f"📁 Обслуживание статических файлов из: {WEB_DIR}")
    app.mount("/static", StaticFiles(directory=WEB_DIR, html=True), name="static")
else:
    logger.warning(f"⚠️ Папка со статическими файлами не найдена: {WEB_DIR}")


# ----------------- Создание таблиц -----------------
@app.on_event("startup")
async def startup_event():
    logger.info("🚀 Запуск Task Tracker API...")
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("✅ Таблицы базы данных созданы")
    except Exception as e:
        logger.error(f"❌ Ошибка при создании таблиц: {e}")


# ----------------- Вспомогательные функции -----------------
def get_current_time():
    return datetime.now(timezone.utc)


def format_datetime(dt: datetime) -> str:
    if not dt:
        return None
    return dt.isoformat()


# ----------------- ВАЖНО: Health check ДОЛЖЕН БЫТЬ ПЕРВЫМ -----------------
@app.get("/health")
async def health_check():
    """Проверка работоспособности сервиса"""
    try:
        # Проверяем подключение к БД
        db = SessionLocal()
        db.execute("SELECT 1")
        db.close()
        db_status = "healthy"
    except Exception as e:
        db_status = f"unhealthy: {str(e)}"
        logger.error(f"❌ Ошибка подключения к БД: {e}")

    return JSONResponse(
        status_code=200,
        content={
            "status": "operational",
            "timestamp": get_current_time().isoformat(),
            "service": "task-tracker-api",
            "database": db_status,
            "version": "2.0.0"
        }
    )


# ----------------- Главная страница -----------------
@app.get("/")
async def serve_index():
    """Главная страница Mini App"""
    index_path = os.path.join(WEB_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)

    html_content = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Task Tracker</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body {
                font-family: Arial, sans-serif;
                text-align: center;
                padding: 50px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0;
            }
            .container {
                background: white;
                padding: 40px;
                border-radius: 20px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                max-width: 500px;
            }
            h1 { color: #333; margin-bottom: 20px; }
            p { color: #666; line-height: 1.6; margin-bottom: 30px; }
            .status {
                background: #10b981;
                color: white;
                padding: 10px 20px;
                border-radius: 10px;
                font-weight: bold;
                display: inline-block;
                margin-bottom: 20px;
            }
            .link {
                display: inline-block;
                background: #4361ee;
                color: white;
                padding: 12px 24px;
                border-radius: 10px;
                text-decoration: none;
                font-weight: bold;
                margin: 5px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="status">✅ Task Tracker API работает</div>
            <h1>Task Tracker API</h1>
            <p>Используйте Mini App в Telegram для работы с задачами.</p>
            <div>
                <a href="/health" class="link">Health Check</a>
                <a href="/api/docs" class="link">API Документация</a>
            </div>
        </div>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)


# ----------------- Остальные API endpoints -----------------
@app.get("/api/tasks", response_model=List[TaskResponse])
async def get_tasks(
        user_id: int = Query(..., description="ID пользователя Telegram"),
        completed: Optional[bool] = None,
        category_id: Optional[int] = None,
        priority: Optional[str] = None,
        due_before: Optional[datetime] = None,
        due_after: Optional[datetime] = None,
        search: Optional[str] = None,
        limit: int = Query(100, ge=1, le=500),
        offset: int = Query(0, ge=0),
        db: Session = Depends(get_db)
):
    """Получить задачи пользователя с фильтрацией"""
    try:
        query = db.query(Task).filter(Task.user_id == user_id)

        if completed is not None:
            query = query.filter(Task.completed == completed)

        if category_id:
            query = query.filter(Task.category_id == category_id)

        if priority:
            query = query.filter(Task.priority == priority)

        if due_before:
            query = query.filter(Task.due_date <= due_before)

        if due_after:
            query = query.filter(Task.due_date >= due_after)

        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(
                    Task.title.ilike(search_term),
                    Task.description.ilike(search_term)
                )
            )

        tasks = query.order_by(
            Task.completed.asc(),
            Task.due_date.asc().nullslast(),
            Task.priority.desc(),
            Task.created_at.desc()
        ).offset(offset).limit(limit).all()

        return tasks
    except Exception as e:
        logger.error(f"❌ Ошибка при получении задач: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.post("/api/tasks", response_model=TaskResponse)
async def create_task(
        task_data: TaskCreate,
        db: Session = Depends(get_db)
):
    """Создать новую задачу"""
    try:
        user = db.query(User).filter(User.telegram_id == task_data.user_id).first()
        if not user:
            user = User(
                telegram_id=task_data.user_id,
                username=task_data.username,
                first_name=task_data.first_name,
                last_name=task_data.last_name
            )
            db.add(user)
            db.commit()
            db.refresh(user)

        task = Task(
            user_id=task_data.user_id,
            title=task_data.title,
            description=task_data.description,
            due_date=task_data.due_date,
            priority=task_data.priority or "medium",
            category_id=task_data.category_id,
            tags=task_data.tags,
            estimated_time=task_data.estimated_time,
            completed=False,
            created_at=get_current_time()
        )

        db.add(task)
        db.commit()
        db.refresh(task)

        logger.info(f"✅ Создана задача ID {task.id} для пользователя {task_data.user_id}")
        return task

    except Exception as e:
        logger.error(f"❌ Ошибка при создании задачи: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.get("/api/tasks/{task_id}", response_model=TaskResponse)
async def get_task(task_id: int, db: Session = Depends(get_db)):
    """Получить задачу по ID"""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@app.put("/api/tasks/{task_id}", response_model=TaskResponse)
async def update_task(
        task_id: int,
        task_update: TaskUpdate,
        db: Session = Depends(get_db)
):
    """Обновить задачу"""
    try:
        task = db.query(Task).filter(Task.id == task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        update_data = task_update.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(task, field, value)

        task.updated_at = get_current_time()
        db.commit()
        db.refresh(task)

        return task

    except Exception as e:
        logger.error(f"❌ Ошибка при обновлении задачи: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.delete("/api/tasks/{task_id}")
async def delete_task(task_id: int, db: Session = Depends(get_db)):
    """Удалить задачу"""
    try:
        task = db.query(Task).filter(Task.id == task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        db.delete(task)
        db.commit()

        return {"success": True, "message": "Task deleted"}

    except Exception as e:
        logger.error(f"❌ Ошибка при удалении задачи: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.post("/api/tasks/{task_id}/complete")
async def complete_task(task_id: int, db: Session = Depends(get_db)):
    """Отметить задачу как выполненную"""
    try:
        task = db.query(Task).filter(Task.id == task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        if not task.completed:
            task.completed = True
            task.completed_at = get_current_time()
            db.commit()

            logger.info(f"✅ Задача {task_id} отмечена как выполненная")

        return {"success": True, "message": "Task completed"}

    except Exception as e:
        logger.error(f"❌ Ошибка при завершении задачи: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


# ----------------- API для пользователей -----------------
@app.post("/api/users/sync")
async def sync_user(
        user_data: UserCreate,
        db: Session = Depends(get_db)
):
    """Синхронизировать пользователя с Telegram"""
    try:
        user = db.query(User).filter(User.telegram_id == user_data.telegram_id).first()

        if user:
            for field, value in user_data.dict(exclude_unset=True).items():
                setattr(user, field, value)
            user.last_seen = get_current_time()
        else:
            user = User(
                telegram_id=user_data.telegram_id,
                username=user_data.username,
                first_name=user_data.first_name,
                last_name=user_data.last_name,
                language_code=user_data.language_code,
                last_seen=get_current_time()
            )
            db.add(user)

        db.commit()
        db.refresh(user)

        return {
            "success": True,
            "user": {
                "id": user.id,
                "telegram_id": user.telegram_id,
                "username": user.username,
                "first_name": user.first_name
            }
        }
    except Exception as e:
        logger.error(f"❌ Ошибка при синхронизации пользователя: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


# ----------------- Специальные эндпоинты -----------------
@app.get("/api/tasks/due-soon/{user_id}")
async def get_due_soon_tasks(user_id: int, db: Session = Depends(get_db)):
    """Получить задачи с истекающим сроком"""
    try:
        now = get_current_time()
        soon = now + timedelta(hours=24)

        tasks = db.query(Task).filter(
            Task.user_id == user_id,
            Task.completed == False,
            Task.due_date.isnot(None),
            Task.due_date >= now,
            Task.due_date <= soon
        ).order_by(Task.due_date.asc()).all()

        return [
            {
                "id": t.id,
                "title": t.title,
                "due_date": format_datetime(t.due_date),
                "priority": t.priority,
                "hours_left": round((t.due_date - now).total_seconds() / 3600, 1)
            }
            for t in tasks
        ]
    except Exception as e:
        logger.error(f"❌ Ошибка при получении задач с истекающим сроком: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


# ----------------- Обработчики ошибок -----------------
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    logger.warning(f"⚠️ HTTP ошибка {exc.status_code}: {exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "error": exc.detail,
            "path": request.url.path
        }
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger.error(f"❌ Необработанная ошибка: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": "Internal server error",
            "message": str(exc)
        }
    )


# ----------------- Запуск приложения -----------------
if __name__ == "__main__":
    import uvicorn

    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", 8000))

    logger.info(f"🚀 Запуск сервера на {host}:{port}")
    logger.info(f"📡 Health check: http://{host}:{port}/health")
    logger.info(f"📚 Документация: http://{host}:{port}/api/docs")

    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        log_level="info",
        access_log=True
    )