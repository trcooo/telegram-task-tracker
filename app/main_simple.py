import os
import logging
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from datetime import datetime

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Создаем приложение
app = FastAPI()

# Health check endpoint - ДОЛЖЕН БЫТЬ ПЕРВЫМ
@app.get("/health")
async def health_check():
    logger.info("✅ Health check called")
    return JSONResponse(
        status_code=200,
        content={
            "status": "healthy",
            "service": "task-tracker-api",
            "timestamp": datetime.utcnow().isoformat(),
            "version": "1.0.0"
        }
    )

# Тестовый endpoint
@app.get("/")
async def root():
    return {"message": "Task Tracker API is running"}

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "0.0.0.0")
    logger.info(f"🚀 Starting server on {host}:{port}")
    uvicorn.run(app, host=host, port=port)