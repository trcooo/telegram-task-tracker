from pydantic import BaseModel, Field, validator
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class PriorityEnum(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class TaskBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    due_date: Optional[datetime] = Field(None)
    priority: Optional[PriorityEnum] = Field(PriorityEnum.MEDIUM)
    category_id: Optional[int] = Field(None)
    tags: Optional[List[str]] = Field(None)
    estimated_time: Optional[int] = Field(None, ge=0)


class TaskCreate(TaskBase):
    user_id: int
    username: Optional[str] = Field(None)
    first_name: Optional[str] = Field(None)
    last_name: Optional[str] = Field(None)


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    due_date: Optional[datetime] = None
    priority: Optional[PriorityEnum] = None
    category_id: Optional[int] = None
    tags: Optional[List[str]] = None
    estimated_time: Optional[int] = Field(None, ge=0)
    completed: Optional[bool] = None


class TaskResponse(TaskBase):
    id: int
    user_id: int
    completed: bool
    completed_at: Optional[datetime]
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class CategoryBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    color: Optional[str] = Field("#667eea")
    icon: Optional[str] = Field("📁")
    description: Optional[str] = Field(None, max_length=500)


class CategoryCreate(CategoryBase):
    user_id: Optional[int] = Field(None)


class CategoryResponse(CategoryBase):
    id: int
    user_id: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True


class UserBase(BaseModel):
    telegram_id: int
    username: Optional[str] = Field(None)
    first_name: Optional[str] = Field(None)
    last_name: Optional[str] = Field(None)
    language_code: Optional[str] = Field("ru")


class UserCreate(UserBase):
    pass


class UserResponse(UserBase):
    id: int
    last_seen: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class TaskStats(BaseModel):
    total_tasks: int
    completed_tasks: int
    active_tasks: int
    due_soon: int
    overdue_tasks: int
    priority_stats: Dict[str, int]


class AnalyticsResponse(BaseModel):
    period: str
    start_date: str
    end_date: str
    completed_tasks: int
    created_tasks: int
    avg_completion_time: Optional[float]
    productive_days: Dict[str, int]