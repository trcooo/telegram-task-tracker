from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from .settings import settings
from .db import engine, Base
from .scheduler import start_scheduler

from .routes.auth import router as auth_router
from .routes.me import router as me_router
from .routes.tasks import router as tasks_router
from .routes.reminders import router as reminders_router
from .routes.stats import router as stats_router
from .routes.tags import router as tags_router
from .routes.projects import router as projects_router

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
    # DB check
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"ok": True}

@app.on_event("startup")
def on_startup():
    # Create tables (simple deploy). For stricter control use migrations later.
    Base.metadata.create_all(bind=engine)
    start_scheduler()

# API routers
app.include_router(auth_router)
app.include_router(me_router)
app.include_router(tasks_router)
app.include_router(reminders_router)
app.include_router(stats_router)
app.include_router(tags_router)
app.include_router(projects_router)

# Static frontend
app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")
