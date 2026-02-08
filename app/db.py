from __future__ import annotations
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from .settings import settings

class Base(DeclarativeBase):
    pass

_engine = None
_SessionLocal = None

def normalize_database_url(url: str) -> str:
    # Railway sometimes provides postgres:// or postgresql://
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://") and "+psycopg" not in url:
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url

def get_engine():
    global _engine
    if _engine is not None:
        return _engine

    url = (settings.DATABASE_URL or "").strip()
    if not url:
        # Fallback so the app can start and pass /health even if envs are not set yet.
        # In production on Railway you SHOULD set DATABASE_URL to Postgres.
        url = "sqlite:///./data.db"
    url = normalize_database_url(url)

    _engine = create_engine(url, pool_pre_ping=True)
    return _engine

def get_sessionmaker():
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(bind=get_engine(), autoflush=False, autocommit=False)
    return _SessionLocal

def get_db():
    SessionLocal = get_sessionmaker()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
