from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text, Table, MetaData, insert
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List as TList, Optional
from datetime import datetime, date as dt_date, timedelta

from ..deps import get_db, get_current_user
from ..db import engine
from ..models import Task, List
from ..schemas import TaskCreate, TaskOut, TaskUpdate
from ..nlp import parse_quick_input

router = APIRouter()

# Cache reflected table metadata for robust inserts on legacy Railway/Postgres DBs
_TASKS_TBL: Optional[Table] = None


def _get_tasks_table() -> Optional[Table]:
    global _TASKS_TBL
    if _TASKS_TBL is not None:
        return _TASKS_TBL
    try:
        if not engine.url.get_backend_name().startswith("postgres"):
            return None
        md = MetaData()
        _TASKS_TBL = Table("tasks", md, autoload_with=engine)
        return _TASKS_TBL
    except Exception:
        return None


def _safe_default_for_col(col, user_date: Optional[str] = None):
    """Best-effort default for NOT NULL legacy columns with no server default."""
    t = str(col.type).lower()
    if "bool" in t:
        return False
    if "json" in t:
        return []
    if "int" in t or "numeric" in t or "float" in t or "double" in t:
        return 0
    if "timestamp" in t or "datetime" in t:
        return datetime.utcnow()
    if t == "date":
        # Prefer the task date if available, else today
        return user_date or dt_date.today().isoformat()
    # text / varchar / unknown
    return ""

@router.get("", response_model=TList[TaskOut])
def get_tasks(
    date: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    user_and_jwt=Depends(get_current_user),
):
    user, _ = user_and_jwt
    q = db.query(Task).filter(Task.user_id == user.id)

    if date:
        q = q.filter(Task.date == date)
    return q.order_by(Task.done.asc(), Task.start_at.asc().nulls_last(), Task.created_at.desc()).all()

@router.post("", response_model=TaskOut)
def create_task(payload: TaskCreate, db: Session = Depends(get_db), user_and_jwt=Depends(get_current_user)):
    user, _ = user_and_jwt

    # allow sending just "raw" for smart input
    if payload.raw and not payload.title:
        parsed = parse_quick_input(payload.raw)
        payload.title = parsed["title"]
        payload.date = parsed.get("date")
        payload.time = parsed.get("time")
        payload.priority = parsed.get("priority", 0)
        payload.tags = parsed.get("tags", [])
        payload.kind = parsed.get("kind", "task")
        payload.focus_flag = parsed.get("focus_flag", False)

    if not payload.title:
        raise HTTPException(status_code=400, detail="title required")

    # resolve list by title if listTitle provided
    list_id = payload.list_id
    if payload.list_title and not list_id:
        lst = db.query(List).filter(List.user_id == user.id, List.title == payload.list_title).first()
        if lst:
            list_id = lst.id

    # ---- Robust insert for legacy Railway/Postgres schemas ----
    tasks_tbl = _get_tasks_table()
    if tasks_tbl is not None:
        values = {
            "user_id": user.id,
            "title": payload.title,
            "note": (payload.note or ""),
            "description": (payload.note or ""),
            "priority": payload.priority or 0,
            "date": payload.date,
            "time": payload.time,
            "all_day": payload.all_day or False,
            "start_at": payload.start_at,
            "end_at": payload.end_at,
            "kind": payload.kind or "task",
            "focus_flag": payload.focus_flag or False,
            "list_id": list_id,
            "tags": payload.tags or [],
            "subtasks": payload.subtasks or [],
            "matrix_quadrant": payload.matrix_quadrant,
            "done": False,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }

        # Hard guarantee for legacy schemas: if `completed` exists, always send a value.
        # Some Railway DBs have NOT NULL + no default on this column.
        if "completed" in {c.name for c in tasks_tbl.columns}:
            col = tasks_tbl.columns.get("completed")
            if col is not None:
                values["completed"] = _safe_default_for_col(col, user_date=payload.date)

        # Fill any NOT NULL columns that have neither server_default nor client default
        for col in tasks_tbl.columns:
            if col.name == "id":
                continue
            if col.name in values:
                # Avoid writing NULL into NOT NULL cols
                if values[col.name] is None and not col.nullable:
                    values[col.name] = _safe_default_for_col(col, user_date=payload.date)
                continue
            if not col.nullable and col.server_default is None and col.default is None:
                values[col.name] = _safe_default_for_col(col, user_date=payload.date)

        # Only keep keys that реально существуют в таблице
        allowed = {c.name for c in tasks_tbl.columns}
        values = {k: v for k, v in values.items() if k in allowed}

        try:
            stmt = insert(tasks_tbl).values(**values).returning(tasks_tbl.c.id)
            new_id = db.execute(stmt).scalar_one()
            db.commit()
        except IntegrityError as e:
            db.rollback()
            raise HTTPException(status_code=400, detail=f"DB integrity error: {str(e.orig) if hasattr(e, 'orig') else str(e)}")

        t = db.get(Task, int(new_id))
        if not t:
            raise HTTPException(status_code=500, detail="Task created but could not be loaded")
        return t

    # ---- Fallback for SQLite/local dev ----
    t = Task(
        user_id=user.id,
        title=payload.title,
        note=(payload.note or ""),
        description=(payload.note or ""),
        priority=payload.priority or 0,
        date=payload.date,
        time=payload.time,
        all_day=payload.all_day or False,
        kind=payload.kind or "task",
        focus_flag=payload.focus_flag or False,
        list_id=list_id,
        tags=payload.tags or [],
        subtasks=payload.subtasks or [],
        matrix_quadrant=payload.matrix_quadrant,
        start_at=payload.start_at,
        end_at=payload.end_at,
    )
    db.add(t)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"DB integrity error: {str(e.orig) if hasattr(e, 'orig') else str(e)}")
    db.refresh(t)
    return t

@router.patch("/{task_id}", response_model=TaskOut)
def update_task(task_id: int, payload: TaskUpdate, db: Session = Depends(get_db), user_and_jwt=Depends(get_current_user)):
    user, _ = user_and_jwt
    t = db.get(Task, task_id)
    if not t or t.user_id != user.id:
        raise HTTPException(status_code=404, detail="task not found")

    updated = payload.model_dump(exclude_unset=True)
    for k, v in updated.items():
        if k in ("note", "description") and v is None:
            v = ""
        setattr(t, k, v)

    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"DB integrity error: {str(e.orig) if hasattr(e, 'orig') else str(e)}")

    # Legacy DB compatibility: some schemas keep a NOT NULL `completed` column.
    # If the column exists, mirror `done` into it so status stays consistent.
    if "done" in updated:
        try:
            db.execute(text('UPDATE "tasks" SET "completed" = :v WHERE "id" = :id'), {"v": bool(t.done), "id": t.id})
            db.commit()
        except Exception:
            db.rollback()

    db.refresh(t)
    return t

@router.delete("/{task_id}")
def delete_task(task_id: int, db: Session = Depends(get_db), user_and_jwt=Depends(get_current_user)):
    user, _ = user_and_jwt
    t = db.get(Task, task_id)
    if not t or t.user_id != user.id:
        raise HTTPException(status_code=404, detail="task not found")
    db.delete(t)
    db.commit()
    return {"ok": True}