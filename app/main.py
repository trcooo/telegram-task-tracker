from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import logging
import os

from .settings import settings
from .db import get_engine, Base
from .scheduler import start_scheduler

from .routes.auth import router as auth_router
from .routes.me import router as me_router
from .routes.tasks import router as tasks_router
from .routes.reminders import router as reminders_router

log = logging.getLogger("tg_planner")
logging.basicConfig(level=getattr(logging, (settings.LOG_LEVEL or "info").upper(), logging.INFO))

app = FastAPI(title="TG Planner MiniApp (One Service)")

if settings.CORS_ORIGIN:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in settings.CORS_ORIGIN.split(",") if o.strip()],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

@app.get("/health")
def health():
    return {"ok": True}

@app.get("/health/info")
def health_info():
    return {
        "ok": True,
        "PORT": os.getenv("PORT"),
        "has_DATABASE_URL": bool((settings.DATABASE_URL or "").strip()),
        "has_BOT_TOKEN": bool((settings.BOT_TOKEN or "").strip()),
        "has_JWT_SECRET": bool((settings.JWT_SECRET or "").strip()),
        "APP_URL": settings.APP_URL,
    }

@app.on_event("startup")
def on_startup():
    try:
        engine = get_engine()
        Base.metadata.create_all(bind=engine)
    except Exception as e:
        log.exception("DB init failed: %s", e)

    try:
        if os.getenv("DISABLE_SCHEDULER") == "1":
            log.warning("Scheduler disabled for this process.")
        elif (settings.BOT_TOKEN or "").strip():
            start_scheduler()
        else:
            log.warning("Scheduler not started: BOT_TOKEN empty.")
    except Exception as e:
        log.exception("Scheduler start failed: %s", e)

app.include_router(auth_router)
app.include_router(me_router)
app.include_router(tasks_router)
app.include_router(reminders_router)

app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")
