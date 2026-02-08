from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, Index
from sqlalchemy.sql import func
from .database import Base

class List(Base):
    __tablename__ = "lists"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=False)

    name = Column(String(120), nullable=False)
    color = Column(String(16), default="#2ECC71", nullable=False)  # hex

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

Index("ix_lists_user_name", List.user_id, List.name)

class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=False)

    # optional: list (0/NULL = inbox)
    list_id = Column(Integer, index=True, nullable=True)

    # old fields kept for backward compatibility (recurrence disabled in UI)
    series_id = Column(String(64), index=True, nullable=True)
    recurrence_rule = Column(Text, nullable=True)  # JSON rule
    recurrence_until = Column(DateTime, nullable=True)

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
Index("ix_tasks_user_list", Task.user_id, Task.list_id)
