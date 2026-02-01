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