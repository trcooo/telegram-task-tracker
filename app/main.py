from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import logging
import os
from sqlalchemy.engine.url import make_url

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
    info = {
        "ok": True,
        "PORT": os.getenv("PORT"),
        "has_DATABASE_URL": bool((settings.DATABASE_URL or "").strip()),
        "has_PGHOST": bool((os.getenv("PGHOST") or "").strip()),
        "has_BOT_TOKEN": bool((settings.BOT_TOKEN or "").strip()),
        "has_JWT_SECRET": bool((settings.JWT_SECRET or "").strip()),
        "APP_URL": settings.APP_URL,
    }

    try:
        from .db import resolved_database_url, normalize_database_url
        url = normalize_database_url(resolved_database_url() or "")
        if url:
            u = make_url(url)
            info["db_driver"] = u.drivername
            info["db_host"] = u.host
            info["db_port"] = u.port
            info["db_name"] = u.database

        engine = get_engine()
        with engine.connect() as conn:
            conn.exec_driver_sql("SELECT 1")
        info["db_ok"] = True
    except Exception as e:
        info["db_ok"] = False
        info["db_error"] = str(e)

    return info

@app.on_event("startup")
def on_startup():
    db_ok = False
    try:
        engine = get_engine()
        Base.metadata.create_all(bind=engine)
        with engine.connect() as conn:
            conn.exec_driver_sql("SELECT 1")
        db_ok = True
    except Exception as e:
        log.exception("DB init failed: %s", e)

    try:
        if os.getenv("DISABLE_SCHEDULER") == "1":
            log.warning("Scheduler disabled for this process.")
        elif not db_ok:
            log.warning("Scheduler not started: DB is not reachable (check DATABASE_URL / Postgres plugin).")
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
