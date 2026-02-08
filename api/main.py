from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
import os

from .db import init_db
from .routes import auth, tasks, lists, reminders
from .scheduler import start_scheduler

load_dotenv()

app = FastAPI(title="All-in-One Productivity Partner API", version="1.0.0")

# CORS: allow Telegram WebView + local dev
origins = os.getenv("CORS_ORIGINS", "*").split(",") if os.getenv("CORS_ORIGINS") else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(tasks.router, prefix="/api/tasks", tags=["tasks"])
app.include_router(lists.router, prefix="/api/lists", tags=["lists"])
app.include_router(reminders.router, prefix="/api/reminders", tags=["reminders"])

# Serve the mobile web app (Telegram Mini App) from / (single-service deployment)
static_dir = os.path.join(os.path.dirname(__file__), "..", "web")
static_dir = os.path.abspath(static_dir)
app.mount("/", StaticFiles(directory=static_dir, html=True), name="web")


@app.on_event("startup")
def _startup():
    init_db()
    start_scheduler()
