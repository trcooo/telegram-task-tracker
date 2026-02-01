from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

# Простая конфигурация БД
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./tasks.db")

# Для SQLite
connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

# Создаем движок
engine = create_engine(DATABASE_URL, connect_args=connect_args)

# Создаем фабрику сессий
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Базовый класс для моделей
Base = declarative_base()