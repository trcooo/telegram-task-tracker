from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, Index
from sqlalchemy.sql import func
from .database import Base

class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=False)

    title = Column(String(200), nullable=False)
    description = Column(String(1000), default="", nullable=False)

    priority = Column(String(20), default="medium", nullable=False)  # high|medium|low
    due_at = Column(DateTime, nullable=True)  # UTC naive

    completed = Column(Boolean, default=False, nullable=False)

    reminder_enabled = Column(Boolean, default=True, nullable=False)
    reminder_sent = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

Index("ix_tasks_user_due", Task.user_id, Task.due_at)
