import os
import sys
import logging
from datetime import datetime

# Добавляем текущую директорию в путь
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, current_dir)

from fastapi import FastAPI, HTTPException, Request, Depends, Query
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse

# Настройка логирования ДО всего
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Создаем приложение
app = FastAPI(title="Task Tracker API")

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
            "version": "1.0.0"
        }
    )


# Попробуем импортировать базу данных с обработкой ошибок
try:
    from database import Base, engine, SessionLocal

    logger.info("✅ Database module imported")


    # Создаем таблицы при запуске
    @app.on_event("startup")
    async def startup_event():
        try:
            Base.metadata.create_all(bind=engine)
            logger.info("✅ Database tables created")
        except Exception as e:
            logger.error(f"❌ Error creating tables: {e}")

except ImportError as e:
    logger.warning(f"⚠️ Database module not found: {e}")
    engine = None
    SessionLocal = None

# Статические файлы
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
        </style>
    </head>
    <body>
        <div class="container">
            <div class="status">✅ Task Tracker API работает</div>
            <h1>Task Tracker API</h1>
            <p>Сервер запущен успешно.</p>
            <p>Mini App готов к работе.</p>
        </div>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)


# Тестовый API endpoint
@app.get("/api/test")
async def test_api():
    return {"status": "ok", "message": "API is working"}


# Простой API для задач (без БД для начала)
@app.get("/api/tasks")
async def get_tasks(user_id: int = Query(1)):
    return {
        "tasks": [
            {
                "id": 1,
                "title": "Пример задачи",
                "completed": False,
                "due_date": None
            }
        ],
        "total": 1
    }


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