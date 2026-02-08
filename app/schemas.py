from pydantic import BaseModel, Field
from typing import Optional, List, Literal

class UserDto(BaseModel):
    id: str
    tgId: str
    username: Optional[str] = None
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    photoUrl: Optional[str] = None

class ProjectDto(BaseModel):
    id: str
    name: str
    color: Optional[str] = None

class TagDto(BaseModel):
    id: str
    name: str
    color: Optional[str] = None

TaskStatus = Literal["TODO","DONE","ARCHIVED"]
TaskQuadrant = Optional[Literal[
    "Q1_URGENT_IMPORTANT",
    "Q2_NOT_URGENT_IMPORTANT",
    "Q3_URGENT_NOT_IMPORTANT",
    "Q4_NOT_URGENT_NOT_IMPORTANT"
]]

class TaskDto(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    status: TaskStatus
    priority: int
    quadrant: TaskQuadrant = None
    startAt: Optional[str] = None
    dueAt: Optional[str] = None
    durationMin: Optional[int] = None
    project: Optional[ProjectDto] = None
    tags: List[TagDto] = Field(default_factory=list)
    nextReminderAt: Optional[str] = None

class ReminderDto(BaseModel):
    id: str
    taskId: str
    taskTitle: str
    remindAt: str
    status: Literal["PENDING","SENT","CANCELED"]
