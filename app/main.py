import os
import sys
import logging
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Dict, Any
import json

# Добавляем путь для импортов
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, HTTPException, Request, Depends, Query
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_

# Импортируем локальные модули
try:
    from database import Base, engine, SessionLocal, get_db
    from models import Task, User

    logger = logging.getLogger(__name__)
    logger.info("✅ Все модули импортированы успешно")
except ImportError as e:
    logger = logging.getLogger(__name__)
    logger.error(f"❌ Ошибка импорта: {e}")
    # Заглушки для тестирования
    Base = object
    engine = None
    SessionLocal = None
    Task = object
    User = object


    def get_db():
        yield None

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

# Создаем приложение
app = FastAPI(
    title="Task Tracker API",
    description="API для Telegram Task Tracker",
    version="2.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Статические файлы
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(BASE_DIR, "web")

if os.path.exists(WEB_DIR):
    logger.info(f"📁 Обслуживание статических файлов из: {WEB_DIR}")
    app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
else:
    logger.warning(f"⚠️ Папка web не найдена: {WEB_DIR}")


# ----------------- Health check -----------------
@app.get("/health")
async def health_check():
    """Проверка работоспособности"""
    try:
        if SessionLocal:
            db = SessionLocal()
            db.execute("SELECT 1")
            db.close()
            db_status = "healthy"
        else:
            db_status = "no_db"
    except Exception as e:
        db_status = f"error: {str(e)}"

    return JSONResponse(
        status_code=200,
        content={
            "status": "operational",
            "timestamp": datetime.utcnow().isoformat(),
            "service": "task-tracker-api",
            "database": db_status,
            "version": "2.0.0"
        }
    )


# ----------------- Создание таблиц -----------------
@app.on_event("startup")
async def startup_event():
    """Создаем таблицы при запуске"""
    logger.info("🚀 Запуск Task Tracker API...")
    try:
        if engine:
            Base.metadata.create_all(bind=engine)
            logger.info("✅ Таблицы базы данных созданы")

            # Создаем тестового пользователя если нет
            db = SessionLocal()
            if db.query(User).count() == 0:
                test_user = User(
                    telegram_id=1,
                    username="test_user",
                    first_name="Test",
                    last_name="User"
                )
                db.add(test_user)
                db.commit()
                logger.info("✅ Тестовый пользователь создан")
            db.close()
    except Exception as e:
        logger.error(f"❌ Ошибка при запуске: {e}")


# ----------------- API для задач -----------------
@app.get("/api/tasks")
async def get_tasks(
        user_id: int = Query(..., description="ID пользователя"),
        completed: Optional[bool] = None,
        search: Optional[str] = None,
        db: Session = Depends(get_db)
):
    """Получить задачи пользователя"""
    try:
        if not SessionLocal:
            return {"tasks": [], "total": 0}

        query = db.query(Task).filter(Task.user_id == user_id)

        if completed is not None:
            query = query.filter(Task.completed == completed)

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
            Task.created_at.desc()
        ).all()

        return {
            "tasks": [
                {
                    "id": t.id,
                    "title": t.title,
                    "description": t.description,
                    "due_date": t.due_date.isoformat() if t.due_date else None,
                    "priority": t.priority or "medium",
                    "completed": t.completed,
                    "created_at": t.created_at.isoformat() if t.created_at else None
                }
                for t in tasks
            ],
            "total": len(tasks)
        }
    except Exception as e:
        logger.error(f"❌ Ошибка получения задач: {e}")
        raise HTTPException(status_code=500, detail="Internal error")


@app.post("/api/tasks")
async def create_task(request: Request, db: Session = Depends(get_db)):
    """Создать задачу"""
    try:
        data = await request.json()

        # Проверяем пользователя
        user = db.query(User).filter(User.telegram_id == data.get("user_id")).first()
        if not user:
            user = User(
                telegram_id=data.get("user_id"),
                username=data.get("username", ""),
                first_name=data.get("first_name", ""),
                last_name=data.get("last_name", "")
            )
            db.add(user)
            db.commit()
            db.refresh(user)

        # Создаем задачу
        due_date = None
        if data.get("due_date"):
            try:
                due_date = datetime.fromisoformat(data["due_date"].replace("Z", "+00:00"))
            except:
                pass

        task = Task(
            user_id=data.get("user_id"),
            title=data.get("title", "Новая задача"),
            description=data.get("description"),
            due_date=due_date,
            priority=data.get("priority", "medium"),
            completed=False
        )

        db.add(task)
        db.commit()
        db.refresh(task)

        logger.info(f"✅ Задача создана: {task.id}")

        return {
            "success": True,
            "task": {
                "id": task.id,
                "title": task.title,
                "due_date": task.due_date.isoformat() if task.due_date else None
            }
        }
    except Exception as e:
        logger.error(f"❌ Ошибка создания задачи: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/tasks/{task_id}/complete")
async def complete_task(task_id: int, db: Session = Depends(get_db)):
    """Отметить задачу выполненной"""
    try:
        task = db.query(Task).filter(Task.id == task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        task.completed = True
        task.completed_at = datetime.utcnow()
        db.commit()

        return {"success": True, "message": "Task completed"}
    except Exception as e:
        logger.error(f"❌ Ошибка завершения задачи: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
        logger.error(f"❌ Ошибка удаления задачи: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ----------------- API для пользователей -----------------
@app.post("/api/users/sync")
async def sync_user(request: Request, db: Session = Depends(get_db)):
    """Синхронизировать пользователя"""
    try:
        data = await request.json()

        user = db.query(User).filter(User.telegram_id == data.get("telegram_id")).first()

        if user:
            # Обновляем
            user.username = data.get("username", user.username)
            user.first_name = data.get("first_name", user.first_name)
            user.last_name = data.get("last_name", user.last_name)
            user.last_seen = datetime.utcnow()
        else:
            # Создаем нового
            user = User(
                telegram_id=data.get("telegram_id"),
                username=data.get("username", ""),
                first_name=data.get("first_name", ""),
                last_name=data.get("last_name", ""),
                language_code=data.get("language_code", "ru"),
                last_seen=datetime.utcnow()
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
        logger.error(f"❌ Ошибка синхронизации: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ----------------- Запуск приложения -----------------
if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "0.0.0.0")

    logger.info(f"🚀 Запуск сервера на {host}:{port}")
    logger.info(f"📡 Health check: http://{host}:{port}/health")

    uvicorn.run(app, host=host, port=port, log_level="info")