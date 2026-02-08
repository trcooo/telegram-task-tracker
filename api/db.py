import os
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

# default to local SQLite for quick testing
if not DATABASE_URL:
    os.makedirs("data", exist_ok=True)
    DATABASE_URL = "sqlite:///./data/app.db"

# Railway/Postgres URLs are often provided as:
#   - postgres://user:pass@host:port/db
#   - postgresql://user:pass@host:port/db
# This project uses psycopg (v3). SQLAlchemy expects the driver prefix:
#   - postgresql+psycopg://...
# so we normalize here.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = "postgresql+psycopg://" + DATABASE_URL[len("postgres://"):]
elif DATABASE_URL.startswith("postgresql://") and "+" not in DATABASE_URL.split("://", 1)[0]:
    DATABASE_URL = "postgresql+psycopg://" + DATABASE_URL[len("postgresql://"):]

# SQLite needs special connect args
connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, echo=False, future=True, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)

class Base(DeclarativeBase):
    pass

def init_db():
    from . import models  # noqa
    Base.metadata.create_all(bind=engine)
    _migrate_schema()


def _migrate_schema() -> None:
    """Best-effort migrations to keep Railway/Postgres deploys from breaking.

    We avoid Alembic for simplicity. This function only *adds missing columns*
    that the app expects (e.g. 'note'). It is safe to run on every startup.
    """
    insp = inspect(engine)

    # If tables don't exist yet, nothing to migrate.
    if not insp.has_table("tasks"):
        return

    existing = {c["name"] for c in insp.get_columns("tasks")}

    # Columns expected by current app model.
    # Keep DDL conservative and compatible with both Postgres and SQLite.
    ddl_by_col = {
        "note": "TEXT",
        "priority": "INTEGER DEFAULT 0",
        "date": "VARCHAR",
        "time": "VARCHAR",
        "all_day": "BOOLEAN DEFAULT FALSE",
        "start_at": "TIMESTAMP",
        "end_at": "TIMESTAMP",
        "kind": "VARCHAR DEFAULT 'task'",
        "focus_flag": "BOOLEAN DEFAULT FALSE",
        "list_id": "INTEGER",
        "tags": "JSON",
        "subtasks": "JSON",
        "matrix_quadrant": "VARCHAR",
        "done": "BOOLEAN DEFAULT FALSE",
        "created_at": "TIMESTAMP",
        "updated_at": "TIMESTAMP",
    }

    missing = [c for c in ddl_by_col.keys() if c not in existing]
    if not missing:
        return

    # Postgres prefers JSONB, SQLite is fine with JSON (stored as TEXT).
    is_postgres = engine.url.get_backend_name().startswith("postgres")

    with engine.begin() as conn:
        for col in missing:
            ddl = ddl_by_col[col]
            if is_postgres and col in ("tags", "subtasks"):
                ddl = "JSONB"
            # Add nullable columns; app can backfill later.
            conn.execute(text(f'ALTER TABLE tasks ADD COLUMN IF NOT EXISTS {col} {ddl}'))
