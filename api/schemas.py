from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class ListCreate(BaseModel):
    title: str
    color: Optional[str] = None

class ListOut(BaseModel):
    id: int
    title: str
    color: Optional[str] = None
    class Config:
        from_attributes = True

class TaskCreate(BaseModel):
    # raw smart input
    raw: Optional[str] = None

    title: Optional[str] = None
    note: Optional[str] = None
    priority: Optional[int] = 0

    date: Optional[str] = None   # YYYY-MM-DD
    time: Optional[str] = None   # HH:mm
    all_day: Optional[bool] = False

    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None

    list_id: Optional[int] = None
    list_title: Optional[str] = None

    subtasks: Optional[List[dict]] = Field(default_factory=list)
    tags: Optional[List[str]] = Field(default_factory=list)
    matrix_quadrant: Optional[str] = None
    focus_flag: Optional[bool] = False
    kind: Optional[str] = "task"

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    note: Optional[str] = None
    priority: Optional[int] = None
    date: Optional[str] = None
    time: Optional[str] = None
    all_day: Optional[bool] = None
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    list_id: Optional[int] = None
    tags: Optional[List[str]] = None
    subtasks: Optional[List[dict]] = None
    matrix_quadrant: Optional[str] = None
    focus_flag: Optional[bool] = None
    kind: Optional[str] = None
    done: Optional[bool] = None

class TaskOut(BaseModel):
    id: int
    title: str
    note: Optional[str] = None
    priority: int
    date: Optional[str] = None
    time: Optional[str] = None
    all_day: bool
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    list_id: Optional[int] = None
    tags: List[str]
    subtasks: List[dict]
    matrix_quadrant: Optional[str] = None
    focus_flag: bool
    kind: str
    done: bool
    class Config:
        from_attributes = True

class ReminderCreate(BaseModel):
    at: datetime

class ReminderOut(BaseModel):
    id: int
    task_id: int
    at: datetime
    method: str
    status: str
    class Config:
        from_attributes = True
