from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class TaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    due_date: Optional[datetime] = None


class TaskCreate(TaskBase):
    user_id: int


class TaskResponse(TaskBase):
    id: int
    user_id: int
    completed: bool
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class UserBase(BaseModel):
    telegram_id: int
    username: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None


class UserCreate(UserBase):
    language_code: Optional[str] = "ru"


class UserResponse(UserBase):
    id: int
    created_at: datetime
    last_seen: Optional[datetime]

    class Config:
        from_attributes = True