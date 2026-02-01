from pydantic import BaseModel, Field, validator
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class PriorityEnum(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class TaskBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200, description="Название задачи")
    description: Optional[str] = Field(None, max_length=1000, description="Описание задачи")
    due_date: Optional[datetime] = Field(None, description="Срок выполнения")
    priority: Optional[PriorityEnum] = Field(PriorityEnum.MEDIUM, description="Приоритет задачи")
    category_id: Optional[int] = Field(None, description="ID категории")
    tags: Optional[List[str]] = Field(None, description="Теги задачи")
    estimated_time: Optional[int] = Field(None, ge=0, description="Оценка времени в минутах")


class TaskCreate(TaskBase):
    user_id: int = Field(..., description="ID пользователя Telegram")
    username: Optional[str] = Field(None, description="Имя пользователя Telegram")
    first_name: Optional[str] = Field(None, description="Имя пользователя")
    last_name: Optional[str] = Field(None, description="Фамилия пользователя")


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
        orm_mode = True
        json_encoders = {
            datetime: lambda dt: dt.isoformat()
        }


class CategoryBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Название категории")
    color: Optional[str] = Field("#667eea", description="Цвет категории в HEX")
    icon: Optional[str] = Field("📁", description="Иконка категории")
    description: Optional[str] = Field(None, max_length=500, description="Описание категории")


class CategoryCreate(CategoryBase):
    user_id: Optional[int] = Field(None, description="ID пользователя (None для общих категорий)")


class CategoryResponse(CategoryBase):
    id: int
    user_id: Optional[int]
    created_at: datetime

    class Config:
        orm_mode = True


class UserBase(BaseModel):
    telegram_id: int = Field(..., description="ID пользователя в Telegram")
    username: Optional[str] = Field(None, description="Имя пользователя Telegram")
    first_name: Optional[str] = Field(None, description="Имя пользователя")
    last_name: Optional[str] = Field(None, description="Фамилия пользователя")
    language_code: Optional[str] = Field("ru", description="Код языка")


class UserCreate(UserBase):
    pass


class UserResponse(UserBase):
    id: int
    last_seen: Optional[datetime]
    created_at: datetime

    class Config:
        orm_mode = True


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