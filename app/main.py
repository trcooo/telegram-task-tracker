import os
import logging
import json
import hashlib
import urllib.parse
from datetime import datetime, timedelta, timezone, date as ddate
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Request, Response, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text

from .database import SessionLocal, engine
from .models import Base, Task, List as TaskList

logger = logging.getLogger("taskflow")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))

WEB_DIR = os.path.join(os.path.dirname(__file__), "web")

# -------------------- DB helpers --------------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def _sha_user_int(key: str) -> int:
    h = hashlib.sha256(key.encode("utf-8")).digest()
    return int.from_bytes(h[:4], "big", signed=False)

def _parse_tg_user_from_init_data(init_data: str) -> Optional[dict]:
    try:
        data = dict(urllib.parse.parse_qsl(init_data, keep_blank_values=True))
        user_json = data.get("user")
        if not user_json:
            return None
        return json.loads(user_json)
    except Exception:
        return None

def get_identity(request: Request) -> dict:
    # 1) Telegram initData (UNVERIFIED, because user chose no bot)
    init_data = request.headers.get("X-Tg-Init-Data") or request.headers.get("x-tg-init-data")
    if init_data:
        u = _parse_tg_user_from_init_data(init_data)
        if u and u.get("id") is not None:
            raw_uid = int(u["id"])
            uid = _sha_user_int(f"tg:{raw_uid}")
            username = u.get("username")
            first = (u.get("first_name") or "").strip()
            last = (u.get("last_name") or "").strip()
            name = (f"{first} {last}".strip() or (f"@{username}" if username else "Telegram"))
            return {"user_id": uid, "name": name, "username": username, "is_guest": False, "key": f"tg:{raw_uid}"}

    # 2) Explicit user key (recommended)
    user_key = request.headers.get("X-User-Key") or request.headers.get("x-user-key")
    if user_key:
        name = (request.headers.get("X-User-Name") or request.headers.get("x-user-name") or "Гость").strip()
        is_guest = user_key.startswith("guest:")
        return {
            "user_id": _sha_user_int(user_key),
            "name": name,
            "username": None,
            "is_guest": bool(is_guest),
            "key": user_key,
        }

    # 3) Legacy: client id
    client_id = request.headers.get("X-Client-Id") or request.headers.get("x-client-id")
    if client_id:
        return {"user_id": _sha_user_int(f"guest:{client_id}"), "name": "Гость", "username": None, "is_guest": True, "key": f"guest:{client_id}"}

    raise HTTPException(status_code=401, detail="no auth headers (X-User-Key recommended)")

def ensure_schema():
    Base.metadata.create_all(bind=engine)

    # add list_id column if missing
    try:
        with engine.connect() as conn:
            dialect = conn.dialect.name
            has_list_id = False
            if dialect == "sqlite":
                res = conn.execute(text("PRAGMA table_info(tasks)")).fetchall()
                cols = [r[1] for r in res]
                has_list_id = "list_id" in cols
            else:
                res = conn.execute(text("""
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_name = 'tasks'
                """)).fetchall()
                cols = [r[0] for r in res]
                has_list_id = "list_id" in cols

            if not has_list_id:
                conn.execute(text("ALTER TABLE tasks ADD COLUMN list_id INTEGER"))
                conn.commit()
                logger.info("Added tasks.list_id column")
    except Exception as e:
        logger.warning(f"Schema ensure warning: {e}")

# -------------------- datetime helpers --------------------
def parse_iso_datetime(val: str) -> datetime:
    # Accept: 2026-02-07T19:00, 2026-02-07T19:00:00Z, 2026-02-07T19:00:00+03:00
    s = (val or "").strip()
    if not s:
        raise ValueError("empty datetime")
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt

def iso(dt: Optional[datetime]) -> Optional[str]:
    if not dt:
        return None
    # stored as naive UTC
    return dt.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")

# -------------------- API models --------------------
class MeOut(BaseModel):
    user_id: int
    name: str
    is_guest: bool
    key: str

class ListOut(BaseModel):
    id: int
    name: str
    color: str

class ListCreate(BaseModel):
    name: str
    color: Optional[str] = None

class TaskOut(BaseModel):
    id: int
    title: str
    description: str
    priority: str
    due_at: Optional[str] = None
    completed: bool
    list_id: Optional[int] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    priority: Optional[str] = "medium"
    due_at: Optional[str] = None
    list_id: Optional[int] = None

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    due_at: Optional[str] = None
    completed: Optional[bool] = None
    list_id: Optional[int] = None

# -------------------- APP --------------------
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    ensure_schema()

@app.get("/health")
async def health():
    return {"ok": True}

@app.get("/api/me", response_model=MeOut)
async def api_me(request: Request):
    ident = get_identity(request)
    return MeOut(user_id=ident["user_id"], name=ident["name"], is_guest=ident["is_guest"], key=ident["key"])

# ---- Lists ----
@app.get("/api/lists", response_model=List[ListOut])
async def get_lists(request: Request, db: Session = Depends(get_db)):
    ident = get_identity(request)
    uid = ident["user_id"]
    lists = db.query(TaskList).filter(TaskList.user_id == uid).order_by(TaskList.id.asc()).all()
    # Inbox is virtual in UI (id=0)
    out = [ListOut(id=0, name="Входящие", color="#4A90E2")]
    out += [ListOut(id=l.id, name=l.name, color=l.color) for l in lists]
    return out

@app.post("/api/lists", response_model=ListOut)
async def create_list(request: Request, payload: ListCreate, db: Session = Depends(get_db)):
    ident = get_identity(request)
    uid = ident["user_id"]
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name_required")
    color = (payload.color or "#2ECC71").strip()[:16]
    l = TaskList(user_id=uid, name=name, color=color)
    db.add(l)
    db.commit()
    db.refresh(l)
    return ListOut(id=l.id, name=l.name, color=l.color)

# ---- Tasks ----
def to_task_out(t: Task) -> TaskOut:
    return TaskOut(
        id=t.id,
        title=t.title,
        description=t.description or "",
        priority=t.priority or "medium",
        due_at=iso(t.due_at),
        completed=bool(t.completed),
        list_id=getattr(t, "list_id", None),
        created_at=iso(getattr(t, "created_at", None)),
        updated_at=iso(getattr(t, "updated_at", None)),
    )

@app.get("/api/tasks", response_model=List[TaskOut])
async def get_tasks(
    request: Request,
    db: Session = Depends(get_db),
    list_id: Optional[int] = None,
    include_completed: bool = True,
):
    ident = get_identity(request)
    uid = ident["user_id"]
    q = db.query(Task).filter(Task.user_id == uid)

    if list_id is not None:
        if int(list_id) == 0:
            q = q.filter(Task.list_id.is_(None))
        else:
            q = q.filter(Task.list_id == int(list_id))

    if not include_completed:
        q = q.filter(Task.completed.is_(False))

    tasks = (
        q.order_by(Task.completed.asc(), Task.due_at.is_(None).asc(), Task.due_at.asc(), Task.id.desc()).all()
    )
    return [to_task_out(t) for t in tasks]

@app.post("/api/tasks", response_model=TaskOut)
async def create_task(request: Request, response: Response, payload: TaskCreate, db: Session = Depends(get_db)):
    ident = get_identity(request)
    uid = ident["user_id"]

    title = (payload.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title_required")

    pr = (payload.priority or "medium").lower().strip()
    if pr not in ("high", "medium", "low"):
        pr = "medium"

    due_utc = parse_iso_datetime(payload.due_at) if payload.due_at else None
    lid = payload.list_id
    if lid is not None and int(lid) <= 0:
        lid = None

    t = Task(
        user_id=uid,
        title=title,
        description=(payload.description or "").strip(),
        priority=pr,
        due_at=due_utc,
        completed=False,
        list_id=lid,
        reminder_enabled=False,
        reminder_sent=False,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    response.headers["X-Created-Count"] = "1"
    return to_task_out(t)

@app.put("/api/tasks/{task_id}", response_model=TaskOut)
async def update_task(request: Request, task_id: int, payload: TaskUpdate, db: Session = Depends(get_db)):
    ident = get_identity(request)
    uid = ident["user_id"]
    t = db.query(Task).filter(Task.id == task_id, Task.user_id == uid).first()
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")

    if payload.title is not None:
        title = payload.title.strip()
        if not title:
            raise HTTPException(status_code=400, detail="title_required")
        t.title = title

    if payload.description is not None:
        t.description = payload.description.strip()

    if payload.priority is not None:
        pr = payload.priority.lower().strip()
        if pr not in ("high", "medium", "low"):
            pr = "medium"
        t.priority = pr

    if payload.due_at is not None:
        t.due_at = parse_iso_datetime(payload.due_at) if payload.due_at else None

    if payload.completed is not None:
        t.completed = bool(payload.completed)

    if payload.list_id is not None:
        lid = payload.list_id
        if lid is not None and int(lid) <= 0:
            lid = None
        t.list_id = lid

    db.commit()
    db.refresh(t)
    return to_task_out(t)

@app.delete("/api/tasks/{task_id}")
async def delete_task(request: Request, task_id: int, db: Session = Depends(get_db)):
    ident = get_identity(request)
    uid = ident["user_id"]
    t = db.query(Task).filter(Task.id == task_id, Task.user_id == uid).first()
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    db.delete(t)
    db.commit()
    return {"success": True}

@app.post("/api/tasks/{task_id}/done", response_model=TaskOut)
async def mark_done(request: Request, task_id: int, db: Session = Depends(get_db)):
    ident = get_identity(request)
    uid = ident["user_id"]
    t = db.query(Task).filter(Task.id == task_id, Task.user_id == uid).first()
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    t.completed = True
    db.commit()
    db.refresh(t)
    return to_task_out(t)

@app.post("/api/tasks/{task_id}/undone", response_model=TaskOut)
async def mark_undone(request: Request, task_id: int, db: Session = Depends(get_db)):
    ident = get_identity(request)
    uid = ident["user_id"]
    t = db.query(Task).filter(Task.id == task_id, Task.user_id == uid).first()
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    t.completed = False
    db.commit()
    db.refresh(t)
    return to_task_out(t)

# ---------- Web ----------
@app.get("/")
async def serve_index():
    index_path = os.path.join(WEB_DIR, "index.html")
    if not os.path.exists(index_path):
        raise HTTPException(status_code=404, detail="index.html not found")
    return FileResponse(index_path)

if os.path.exists(WEB_DIR):
    app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")

# asset shortcuts
@app.get("/style.css")
async def style_css():
    return FileResponse(os.path.join(WEB_DIR, "style.css"), media_type="text/css")

@app.get("/app.js")
async def app_js():
    return FileResponse(os.path.join(WEB_DIR, "app.js"), media_type="application/javascript")

@app.get("/logo.png")
async def logo_png():
    return FileResponse(os.path.join(WEB_DIR, "logo.png"), media_type="image/png")

@app.get("/manifest.json")
async def manifest_json():
    return FileResponse(os.path.join(WEB_DIR, "manifest.json"), media_type="application/json")

@app.exception_handler(Exception)
async def any_error(request: Request, exc: Exception):
    logger.exception("Unhandled error")
    return JSONResponse(status_code=500, content={"success": False, "error": "Internal server error"})
