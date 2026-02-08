from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import logging

from .settings import settings
from .db import get_engine, Base
from .scheduler import start_scheduler

from .routes.auth import router as auth_router
from .routes.me import router as me_router
from .routes.tasks import router as tasks_router
from .routes.reminders import router as reminders_router
from .routes.stats import router as stats_router
from .routes.tags import router as tags_router
from .routes.projects import router as projects_router

log = logging.getLogger("tg_planner")

app = FastAPI(title="TG Planner MiniApp (Python)")

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
    # Healthcheck must not depend on DB / external services.
    return {"ok": True}

@app.get("/health/info")
def health_info():
    # Helpful for debugging in Railway logs / curl
    return {
        "ok": True,
        "has_DATABASE_URL": bool((settings.DATABASE_URL or "").strip()),
        "has_BOT_TOKEN": bool((settings.BOT_TOKEN or "").strip()),
        "has_JWT_SECRET": bool((settings.JWT_SECRET or "").strip()),
    }

@app.on_event("startup")
def on_startup():
    # Try DB init, but don't crash if env missing / DB not ready.
    try:
        engine = get_engine()
        Base.metadata.create_all(bind=engine)
    except Exception as e:
        log.exception("DB init failed on startup: %s", e)

    # Start scheduler only if BOT_TOKEN is present
    try:
        if (settings.BOT_TOKEN or "").strip():
            start_scheduler()
        else:
            log.warning("Scheduler not started: BOT_TOKEN is empty.")
    except Exception as e:
        log.exception("Scheduler start failed: %s", e)

# API routers
app.include_router(auth_router)
app.include_router(me_router)
app.include_router(tasks_router)
app.include_router(reminders_router)
app.include_router(stats_router)
app.include_router(tags_router)
app.include_router(projects_router)

# Static frontend (mount last)
app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")
