import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv

from .db import engine, Base
from .api import router as api_router
from .telegram_bot import router as tg_router

load_dotenv()

app = FastAPI(title="Telegram Planner MVP")

# Create tables on startup (MVP). For production, replace with Alembic migrations.
Base.metadata.create_all(bind=engine)

app.include_router(api_router)
app.include_router(tg_router)

static_dir = os.path.join(os.path.dirname(__file__), "static")
app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/")
def index():
    return FileResponse(os.path.join(static_dir, "index.html"))
