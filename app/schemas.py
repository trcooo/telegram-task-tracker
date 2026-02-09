from datetime import datetime, date, timezone
from pydantic import BaseModel, Field, field_serializer

class AuthIn(BaseModel):
    init_data: str

class AuthOut(BaseModel):
    token: str
    user: dict

class ProjectOut(BaseModel):
    id: int
    name: str
    color: str

class ProjectCreate(BaseModel):
    name: str
    color: str = "#6EA8FF"

class TaskOut(BaseModel):
    id: int
    title: str
    notes: str | None = None
    status: str
    priority: int
    due_date: date | None = None
    estimate_min: int
    project: ProjectOut | None = None

class TaskCreate(BaseModel):
    title: str
    notes: str | None = None
    priority: int = 2
    due_date: date | None = None
    estimate_min: int = 30
    project_id: int | None = None

class TaskUpdate(BaseModel):
    title: str | None = None
    notes: str | None = None
    status: str | None = None
    priority: int | None = None
    due_date: date | None = None
    estimate_min: int | None = None
    project_id: int | None = None

class EventOut(BaseModel):
    id: int
    title: str
    start_dt: datetime
    end_dt: datetime
    color: str
    source: str
    task_id: int | None = None

    @field_serializer("start_dt", "end_dt")
    def _ser_dt(self, v: datetime):
        # Store UTC-naive in DB, but send as UTC-aware ISO to the client
        if v.tzinfo is None:
            v = v.replace(tzinfo=timezone.utc)
        return v.isoformat()

class EventCreate(BaseModel):
    title: str
    start_dt: datetime
    end_dt: datetime
    color: str = "#6EA8FF"
    source: str = "manual"
    task_id: int | None = None

class EventUpdate(BaseModel):
    title: str | None = None
    start_dt: datetime | None = None
    end_dt: datetime | None = None
    color: str | None = None

class PlanTaskIn(BaseModel):
    start_dt: datetime
    duration_min: int = Field(default=30, ge=5, le=720)


class UserTimezoneIn(BaseModel):
    timezone: str
