from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from .db import Base

class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True)  # telegram user id as string
    first_name = Column(String, nullable=True)
    username = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    tasks = relationship("Task", back_populates="user", cascade="all, delete-orphan")
    lists = relationship("List", back_populates="user", cascade="all, delete-orphan")

class List(Base):
    __tablename__ = "lists"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), index=True, nullable=False)
    title = Column(String, nullable=False)
    color = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="lists")
    tasks = relationship("Task", back_populates="list")

class Task(Base):
    __tablename__ = "tasks"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), index=True, nullable=False)

    title = Column(String, nullable=False)
    note = Column(Text, nullable=True)

    priority = Column(Integer, default=0)  # 0..3
    date = Column(String, nullable=True)   # YYYY-MM-DD (local)
    time = Column(String, nullable=True)   # HH:mm
    all_day = Column(Boolean, default=False)

    start_at = Column(DateTime, nullable=True)
    end_at = Column(DateTime, nullable=True)

    kind = Column(String, default="task")  # task/meeting/study/other
    focus_flag = Column(Boolean, default=False)

    list_id = Column(Integer, ForeignKey("lists.id"), nullable=True)
    tags = Column(JSON, default=list)
    subtasks = Column(JSON, default=list)

    matrix_quadrant = Column(String, nullable=True)  # Q1..Q4

    done = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="tasks")
    list = relationship("List", back_populates="tasks")
    reminders = relationship("Reminder", back_populates="task", cascade="all, delete-orphan")

class Reminder(Base):
    __tablename__ = "reminders"
    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), index=True, nullable=False)

    at = Column(DateTime, nullable=False)
    method = Column(String, default="telegram")
    status = Column(String, default="scheduled")  # scheduled/snoozed/sent/cancelled
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    task = relationship("Task", back_populates="reminders")
