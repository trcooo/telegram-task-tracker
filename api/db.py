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
        """Add missing columns to an existing table (best-effort).

        This keeps deployments working without Alembic by only adding columns the app expects.
        """
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


    def _col_type(table: str, col: str) -> str | None:
        if not insp.has_table(table):
            return None
        for c in insp.get_columns(table):
            if c.get("name") == col:
                return str(c.get("type")).lower()
        return None

    def _pg_constraint_exists(conn, conname: str) -> bool:
        try:
            row = conn.execute(text("SELECT 1 FROM pg_constraint WHERE conname = :n LIMIT 1"), {"n": conname}).first()
            return row is not None
        except Exception:
            return False

    def _ensure_varchar(table: str, col: str) -> None:
        """If an existing Postgres column is non-text, convert it to VARCHAR.

        Fixes legacy Railway schemas where Telegram user_id/users.id were created as INTEGER.
        """
        if not is_postgres:
            return
        t = _col_type(table, col)
        if not t:
            return
        # already some sort of character type -> ok
        if ("char" in t) or ("text" in t) or ("varchar" in t):
            return

        with engine.begin() as conn:
            # Drop common FK names first (best-effort) to avoid type-change failures.
            for con in (f"{table}_{col}_fkey", f"fk_{table}_{col}"):
                try:
                    conn.execute(text(f'ALTER TABLE "{table}" DROP CONSTRAINT IF EXISTS "{con}"'))
                except Exception:
                    pass

            # Convert
            try:
                conn.execute(text(f'ALTER TABLE "{table}" ALTER COLUMN "{col}" TYPE VARCHAR USING "{col}"::VARCHAR'))
            except Exception:
                # Fallback cast
                try:
                    conn.execute(text(f'ALTER TABLE "{table}" ALTER COLUMN "{col}" TYPE VARCHAR USING "{col}"::TEXT'))
                except Exception:
                    pass

    def _ensure_user_fks() -> None:
        """Recreate user foreign keys (best-effort) after type fixes."""
        if not is_postgres:
            return
        with engine.begin() as conn:
            # tasks.user_id -> users.id
            if insp.has_table("tasks") and insp.has_table("users"):
                con = "tasks_user_id_fkey"
                if not _pg_constraint_exists(conn, con):
                    try:
                        conn.execute(text('ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE'))
                    except Exception:
                        pass
            # lists.user_id -> users.id
            if insp.has_table("lists") and insp.has_table("users"):
                con = "lists_user_id_fkey"
                if not _pg_constraint_exists(conn, con):
                    try:
                        conn.execute(text('ALTER TABLE "lists" ADD CONSTRAINT "lists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE'))
                    except Exception:
                        pass

    # ---- legacy type fixes (Railway/Postgres) ----
    # Older releases used INTEGER for user ids; current app uses string ids everywhere.
    _ensure_varchar("tasks", "user_id")
    _ensure_varchar("lists", "user_id")
    _ensure_varchar("users", "id")

    # refresh inspector after any ALTER TABLE
    insp = inspect(engine)
    _ensure_user_fks()
    insp = inspect(engine)

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
