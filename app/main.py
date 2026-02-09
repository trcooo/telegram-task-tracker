import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv

from .db import engine, Base
from .api import router as api_router
from .telegram_bot import router as tg_router

load_dotenv()


from sqlalchemy import text

def _auto_migrate():
    """
    Tiny safety migration for MVP:
    Telegram user ids can exceed 32-bit int. If the DB was created earlier with INTEGER,
    we upgrade users.telegram_id to BIGINT.
    """
    try:
        with engine.begin() as conn:
            # Works in Postgres; no-op / safe to fail in SQLite.
            conn.execute(text("ALTER TABLE users ALTER COLUMN telegram_id TYPE BIGINT"))
    except Exception:
        pass

app = FastAPI(title="Telegram Planner MVP")

# Create tables on startup (MVP). For production, replace with Alembic migrations.
Base.metadata.create_all(bind=engine)
_auto_migrate()

app.include_router(api_router)
app.include_router(tg_router)

static_dir = os.path.join(os.path.dirname(__file__), "static")
app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/")
def index():
    return FileResponse(os.path.join(static_dir, "index.html"))
