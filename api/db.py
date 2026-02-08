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
    that the app expects. It is safe to run on every startup.
    """
    insp = inspect(engine)
    dialect = engine.url.get_backend_name()
    is_postgres = dialect.startswith("postgres")
    is_sqlite = dialect.startswith("sqlite")

    def add_missing_columns(table: str, ddl_by_col: dict, backfill_sql: list[str] | None = None):
        if not insp.has_table(table):
            return
        existing = {c["name"] for c in insp.get_columns(table)}
        missing = [c for c in ddl_by_col.keys() if c not in existing]
        if not missing and not backfill_sql:
            return

        with engine.begin() as conn:
            # Add columns
            for col in missing:
                ddl = ddl_by_col[col]
                # Postgres prefers JSONB
                if is_postgres and col in ("tags", "subtasks"):
                    ddl = "JSONB"
                # SQLite doesn't support IF NOT EXISTS for ADD COLUMN in many environments
                if is_sqlite:
                    conn.execute(text(f'ALTER TABLE {table} ADD COLUMN {col} {ddl}'))
                else:
                    conn.execute(text(f'ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col} {ddl}'))

            # Backfill (optional, best-effort)
            if backfill_sql:
                for stmt in backfill_sql:
                    try:
                        conn.execute(text(stmt))
                    except Exception:
                        # ignore backfill errors (e.g. column doesn't exist in some legacy schemas)
                        pass

    # ---- tasks ----
    add_missing_columns("tasks", {
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
    })

    # ---- lists ----
    # Some older schemas used "name" instead of "title". We add title and backfill from name.
    add_missing_columns("lists", {
        "title": "VARCHAR",
        "color": "VARCHAR",
        "created_at": "TIMESTAMP",
    }, backfill_sql=[
        "UPDATE lists SET title = name WHERE title IS NULL AND name IS NOT NULL",
    ])

    # ---- reminders ----
    add_missing_columns("reminders", {
        "status": "VARCHAR DEFAULT 'scheduled'",
        "method": "VARCHAR DEFAULT 'telegram'",
        "at": "TIMESTAMP",
        "task_id": "INTEGER",
        "created_at": "TIMESTAMP",
        "updated_at": "TIMESTAMP",
    })
