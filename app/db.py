from __future__ import annotations

import os
from urllib.parse import quote_plus, urlencode, urlsplit, urlunsplit, parse_qsl

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy.engine.url import make_url

from .settings import settings


class Base(DeclarativeBase):
    pass


_engine = None
_SessionLocal = None


def _add_connect_timeout(url: str, seconds: int = 5) -> str:
    try:
        parts = urlsplit(url)
        q = dict(parse_qsl(parts.query, keep_blank_values=True))
        if "connect_timeout" not in q:
            q["connect_timeout"] = str(seconds)
            return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(q), parts.fragment))
    except Exception:
        pass
    return url


def normalize_database_url(url: str) -> str:
    url = (url or "").strip()
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://") and "+psycopg" not in url:
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    if url.startswith("postgresql"):
        url = _add_connect_timeout(url, 5)
    return url


def build_database_url_from_pg_env() -> str:
    host = os.getenv("PGHOST") or os.getenv("POSTGRES_HOST") or os.getenv("POSTGRESQL_HOST")
    port = os.getenv("PGPORT") or os.getenv("POSTGRES_PORT") or os.getenv("POSTGRESQL_PORT")
    user = os.getenv("PGUSER") or os.getenv("POSTGRES_USER") or os.getenv("POSTGRESQL_USER")
    pwd = os.getenv("PGPASSWORD") or os.getenv("POSTGRES_PASSWORD") or os.getenv("POSTGRESQL_PASSWORD")
    db = os.getenv("PGDATABASE") or os.getenv("POSTGRES_DB") or os.getenv("POSTGRESQL_DB")

    if not (host and port and user and pwd and db):
        return ""

    pwd_enc = quote_plus(pwd)
    return f"postgresql+psycopg://{user}:{pwd_enc}@{host}:{port}/{db}"


def validate_database_url(url: str) -> None:
    u = (url or "").strip()
    if not u:
        return
    lowered = u.lower()
    if "@host:" in lowered or "://user:" in lowered or "host:port" in lowered:
        raise ValueError("DATABASE_URL looks like a template. Copy the real connection string from Railway Postgres.")
    parsed = make_url(u)
    if parsed.drivername.startswith("postgresql") and not parsed.host:
        raise ValueError("DATABASE_URL has no host.")


def resolved_database_url() -> str:
    url = (settings.DATABASE_URL or "").strip()
    if not url:
        url = build_database_url_from_pg_env()
    return url


def get_engine():
    global _engine
    if _engine is not None:
        return _engine

    url = resolved_database_url()
    if not url:
        url = "sqlite:///./data.db"

    url = normalize_database_url(url)
    validate_database_url(url)

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


def SessionLocal():
    return get_sessionmaker()()
