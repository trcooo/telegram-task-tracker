import os
import sys

# Добавляем текущую директорию в PYTHONPATH
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse, HTMLResponse
from datetime import datetime
import logging

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Создаем приложение
app = FastAPI(
    title="Task Tracker API",
    description="API для Telegram Task Tracker Mini App",
    version="1.0.0"
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
    logger.info(f"Обслуживание статических файлов из: {WEB_DIR}")
    app.mount("/static", StaticFiles(directory=WEB_DIR, html=True), name="static")
else:
    logger.warning(f"Папка со статическими файлами не найдена: {WEB_DIR}")

# Импорт локальных модулей (используем относительные импорты)
try:
    from .database import Base, engine, SessionLocal
    from .models import Task, User

    logger.info("Модули базы данных загружены успешно")
except ImportError as e:
    logger.error(f"Ошибка импорта модулей: {e}")


# Создаем таблицы при запуске
@app.on_event("startup")
async def startup():
    logger.info("Запуск приложения...")
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Таблицы базы данных созданы")
    except Exception as e:
        logger.error(f"Ошибка при создании таблиц: {e}")


# Health check endpoint
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
        logger.error(f"Ошибка подключения к БД: {e}")

    return {
        "status": "operational",
        "timestamp": datetime.utcnow().isoformat(),
        "service": "task-tracker-api",
        "database": db_status,
        "version": "1.0.0"
    }


# Главная страница
@app.get("/")
async def serve_index():
    """Главная страница Mini App"""
    index_path = os.path.join(WEB_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)

    # Если файл не найден, возвращаем базовый HTML
    html_content = """
    <!DOCTYPE html>
    <html lang="ru">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Task Tracker</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
                margin: 0;
                padding: 20px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .container {
                background: white;
                padding: 40px;
                border-radius: 20px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                text-align: center;
                max-width: 500px;
            }
            h1 {
                color: #333;
                margin-bottom: 20px;
            }
            p {
                color: #666;
                line-height: 1.6;
                margin-bottom: 30px;
            }
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
                transition: transform 0.2s;
            }
            .link:hover {
                transform: translateY(-2px);
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="status">✅ Сервер работает</div>
            <h1>Task Tracker API</h1>
            <p>Используйте Mini App в Telegram для работы с задачами.</p>
            <p>API доступно по адресам:</p>
            <ul style="text-align: left; display: inline-block;">
                <li><code>/health</code> - проверка работы</li>
                <li><code>/api/tasks</code> - API задач</li>
                <li><code>/api/docs</code> - документация API</li>
            </ul>
            <p style="margin-top: 30px;">
                <a href="/api/docs" class="link">Открыть документацию</a>
            </p>
        </div>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)


# Документация API
@app.get("/api/docs")
async def api_docs_redirect():
    """Перенаправление на Swagger документацию"""
    return JSONResponse({
        "message": "Документация API доступна по адресу /docs",
        "links": {
            "swagger": "/docs",
            "redoc": "/redoc",
            "openapi": "/openapi.json"
        }
    })


# API для задач
@app.get("/api/tasks")
async def get_tasks():
    """Получить список задач (заглушка)"""
    return {
        "tasks": [],
        "total": 0,
        "message": "API в разработке"
    }


@app.post("/api/tasks")
async def create_task(request: Request):
    """Создать новую задачу (заглушка)"""
    data = await request.json()
    return {
        "success": True,
        "message": "Задача создана",
        "task_id": 1,
        "data": data
    }


# Обработчики ошибок
@app.exception_handler(404)
async def not_found_handler(request: Request, exc):
    return JSONResponse(
        status_code=404,
        content={"error": "Не найдено", "path": request.url.path}
    )


@app.exception_handler(500)
async def internal_error_handler(request: Request, exc):
    logger.error(f"Ошибка 500: {exc}")
    return JSONResponse(
        status_code=500,
        content={"error": "Внутренняя ошибка сервера"}
    )


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", 8000))
    logger.info(f"Запуск сервера на порту {port}")
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=False
    )


@app.get("/api/tasks/{user_id}")
async def get_user_tasks(user_id: int, db: Session = Depends(get_db)):
    """Получить задачи пользователя"""
    tasks = db.query(Task).filter(Task.user_id == user_id).all()
    return [
        {
            "id": t.id,
            "user_id": t.user_id,
            "title": t.title,
            "description": t.description,
            "due_date": t.due_date.isoformat() if t.due_date else None,
            "priority": t.priority or "medium",
            "completed": t.completed,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "updated_at": t.updated_at.isoformat() if t.updated_at else None
        }
        for t in tasks
    ]


@app.post("/api/tasks")
async def create_task_api(request: Request, db: Session = Depends(get_db)):
    """Создать задачу через API"""
    try:
        data = await request.json()

        task = Task(
            user_id=data.get("user_id"),
            title=data.get("title"),
            description=data.get("description"),
            due_date=datetime.fromisoformat(data["due_date"]) if data.get("due_date") else None,
            priority=data.get("priority", "medium"),
            completed=data.get("completed", False)
        )

        db.add(task)
        db.commit()
        db.refresh(task)

        return {
            "success": True,
            "task": {
                "id": task.id,
                "title": task.title
            }
        }
    except Exception as e:
        logger.error(f"API Error creating task: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/tasks/{task_id}")
async def update_task_api(task_id: int, request: Request, db: Session = Depends(get_db)):
    """Обновить задачу"""
    try:
        data = await request.json()
        task = db.query(Task).filter(Task.id == task_id).first()

        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        # Обновляем поля
        if "title" in data:
            task.title = data["title"]
        if "description" in data:
            task.description = data["description"]
        if "due_date" in data:
            task.due_date = datetime.fromisoformat(data["due_date"]) if data["due_date"] else None
        if "priority" in data:
            task.priority = data["priority"]
        if "completed" in data:
            task.completed = data["completed"]

        task.updated_at = datetime.utcnow()
        db.commit()

        return {"success": True, "message": "Task updated"}
    except Exception as e:
        logger.error(f"API Error updating task: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/tasks/{task_id}")
async def delete_task_api(task_id: int, db: Session = Depends(get_db)):
    """Удалить задачу"""
    try:
        task = db.query(Task).filter(Task.id == task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        db.delete(task)
        db.commit()

        return {"success": True, "message": "Task deleted"}
    except Exception as e:
        logger.error(f"API Error deleting task: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/tasks/{task_id}/done")
async def complete_task_api(task_id: int, db: Session = Depends(get_db)):
    """Отметить задачу как выполненную"""
    try:
        task = db.query(Task).filter(Task.id == task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        task.completed = True
        task.updated_at = datetime.utcnow()
        db.commit()

        return {"success": True, "message": "Task completed"}
    except Exception as e:
        logger.error(f"API Error completing task: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/tasks/{task_id}/undone")
async def uncomplete_task_api(task_id: int, db: Session = Depends(get_db)):
    """Вернуть задачу в активные"""
    try:
        task = db.query(Task).filter(Task.id == task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        task.completed = False
        task.updated_at = datetime.utcnow()
        db.commit()

        return {"success": True, "message": "Task uncompleted"}
    except Exception as e:
        logger.error(f"API Error uncompleting task: {e}")
        raise HTTPException(status_code=500, detail=str(e))