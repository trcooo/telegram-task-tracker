from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func

# Импортируем Base из database (файл лежит рядом, поэтому без относительного импорта)
from database import Base


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)

    # Telegram user id
    user_id = Column(Integer, index=True, nullable=False)

    title = Column(String(200), nullable=False)
    description = Column(String(500), default="", nullable=False)

    # high | medium | low
    priority = Column(String(20), default="medium", nullable=False)

    # UTC datetime stored as naive (frontend sends toISOString())
    due_at = Column(DateTime, nullable=True)

    completed = Column(Boolean, default=False, nullable=False)

    # Чтобы не слать напоминание много раз
    reminder_sent = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    telegram_id = Column(Integer, unique=True, index=True)
    username = Column(String(100))
    first_name = Column(String(100))
    last_name = Column(String(100))
