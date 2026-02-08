import os
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

# default to local SQLite for quick testing
if not DATABASE_URL:
    os.makedirs("data", exist_ok=True)
    DATABASE_URL = "sqlite:///./data/app.db"

# Normalize Railway/Postgres URLs to SQLAlchemy psycopg driver
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = "postgresql+psycopg://" + DATABASE_URL[len("postgres://"):]
elif DATABASE_URL.startswith("postgresql://") and "+" not in DATABASE_URL.split("://", 1)[0]:
    DATABASE_URL = "postgresql+psycopg://" + DATABASE_URL[len("postgresql://"):]

connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, echo=False, future=True, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)


class Base(DeclarativeBase):
    pass


def init_db():
    # Import models so Base.metadata is populated
    from . import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _migrate_schema()


def _migrate_schema() -> None:
    """Best-effort migrations to keep Railway/Postgres deploys from breaking.

    No Alembic here: we only add/fix columns that the app expects, and we patch
    legacy Railway schemas (user_id types, tasks.description/completed NOT NULL).
    Safe to run on every startup.
    """
    dialect = engine.url.get_backend_name()
    is_postgres = dialect.startswith("postgres")
    is_sqlite = dialect.startswith("sqlite")

    def _insp():
        # SQLAlchemy Inspector caches; recreate when schema changes
        return inspect(engine)

    def _has_table(table: str) -> bool:
        return _insp().has_table(table)

    def _cols(table: str) -> set[str]:
        if not _has_table(table):
            return set()
        return {c["name"] for c in _insp().get_columns(table)}

    def _col_type(table: str, col: str) -> str | None:
        if not _has_table(table):
            return None
        for c in _insp().get_columns(table):
            if c.get("name") == col:
                return str(c.get("type")).lower()
        return None

    def add_missing_columns(table: str, ddl_by_col: dict[str, str], backfill_sql: list[str] | None = None):
        if not _has_table(table):
            return
        existing = _cols(table)
        missing = [c for c in ddl_by_col.keys() if c not in existing]
        if not missing and not backfill_sql:
            return

        with engine.begin() as conn:
            for col in missing:
                ddl = ddl_by_col[col]
                # Postgres prefers JSONB
                if is_postgres and col in ("tags", "subtasks"):
                    ddl = "JSONB"
                if is_sqlite:
                    conn.execute(text(f'ALTER TABLE "{table}" ADD COLUMN "{col}" {ddl}'))
                else:
                    conn.execute(text(f'ALTER TABLE "{table}" ADD COLUMN IF NOT EXISTS "{col}" {ddl}'))

            if backfill_sql:
                for stmt in backfill_sql:
                    try:
                        conn.execute(text(stmt))
                    except Exception:
                        pass

    def _pg_constraint_exists(conn, conname: str) -> bool:
        try:
            row = conn.execute(text("SELECT 1 FROM pg_constraint WHERE conname = :n LIMIT 1"), {"n": conname}).first()
            return row is not None
        except Exception:
            return False

    def _ensure_varchar(table: str, col: str) -> None:
        # Fix legacy Railway schemas where Telegram ids were created as INTEGER
        if not is_postgres or not _has_table(table):
            return
        t = _col_type(table, col)
        if not t:
            return
        if ("char" in t) or ("text" in t) or ("varchar" in t):
            return

        with engine.begin() as conn:
            # Drop common FK names first (best-effort)
            for con in (f"{table}_{col}_fkey", f"fk_{table}_{col}"):
                try:
                    conn.execute(text(f'ALTER TABLE "{table}" DROP CONSTRAINT IF EXISTS "{con}"'))
                except Exception:
                    pass
            try:
                conn.execute(text(f'ALTER TABLE "{table}" ALTER COLUMN "{col}" TYPE VARCHAR USING "{col}"::VARCHAR'))
            except Exception:
                try:
                    conn.execute(text(f'ALTER TABLE "{table}" ALTER COLUMN "{col}" TYPE VARCHAR USING "{col}"::TEXT'))
                except Exception:
                    pass

    def _ensure_jsonb(table: str, col: str) -> None:
        """If an existing Postgres column is not JSON/JSONB, try to convert it to JSONB (best-effort)."""
        if not is_postgres or not _has_table(table):
            return
        t = _col_type(table, col)
        if not t:
            return
        if "json" in t:
            return

        with engine.begin() as conn:
            # Backfill NULLs with an empty array (works for text/varchar)
            try:
                conn.execute(text(f'UPDATE "{table}" SET "{col}" = \'[]\' WHERE "{col}" IS NULL'))
            except Exception:
                pass
            # Try to convert; if legacy data contains invalid JSON, keep original type.
            try:
                conn.execute(text(f'ALTER TABLE "{table}" ALTER COLUMN "{col}" TYPE JSONB USING "{col}"::jsonb'))
            except Exception:
                pass

    def _ensure_user_fks() -> None:
        if not is_postgres:
            return
        with engine.begin() as conn:
            if _has_table("tasks") and _has_table("users"):
                con = "tasks_user_id_fkey"
                if not _pg_constraint_exists(conn, con):
                    try:
                        conn.execute(text('ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE'))
                    except Exception:
                        pass
            if _has_table("lists") and _has_table("users"):
                con = "lists_user_id_fkey"
                if not _pg_constraint_exists(conn, con):
                    try:
                        conn.execute(text('ALTER TABLE "lists" ADD CONSTRAINT "lists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE'))
                    except Exception:
                        pass

    def _ensure_description_default() -> None:
        """Legacy fix: tasks.description NOT NULL with no default -> breaks inserts."""
        if not is_postgres or not _has_table("tasks"):
            return
        if "description" not in _cols("tasks"):
            return

        with engine.begin() as conn:
            try:
                conn.execute(text('UPDATE "tasks" SET "description" = \'\' WHERE "description" IS NULL'))
            except Exception:
                pass
            try:
                conn.execute(text('ALTER TABLE "tasks" ALTER COLUMN "description" SET DEFAULT \'\''))
            except Exception:
                pass
            try:
                conn.execute(text('ALTER TABLE "tasks" ALTER COLUMN "description" DROP NOT NULL'))
            except Exception:
                pass

    def _ensure_completed_default() -> None:
        """Legacy fix: tasks.completed NOT NULL with no default -> breaks inserts.

        Some older schemas used `completed` instead of (or alongside) `done`.
        If the column exists and has no DEFAULT, inserts that omit it will fail.
        We set a safe DEFAULT and backfill NULLs (best-effort).
        """
        if not is_postgres or not _has_table("tasks"):
            return
        if "completed" not in _cols("tasks"):
            return

        t = (_col_type("tasks", "completed") or "").lower()
        if "int" in t:
            default_sql = "0"
            null_sql = "0"
        elif ("char" in t) or ("text" in t):
            default_sql = "'false'"
            null_sql = "'false'"
        else:
            default_sql = "FALSE"
            null_sql = "FALSE"

        with engine.begin() as conn:
            try:
                conn.execute(text(f'UPDATE "tasks" SET "completed" = {null_sql} WHERE "completed" IS NULL'))
            except Exception:
                pass
            try:
                conn.execute(text(f'ALTER TABLE "tasks" ALTER COLUMN "completed" SET DEFAULT {default_sql}'))
            except Exception:
                pass

        # Keep the app column `done` in sync with legacy `completed` when possible
        if "done" in _cols("tasks"):
            with engine.begin() as conn:
                try:
                    conn.execute(text('UPDATE "tasks" SET "done" = "completed" WHERE "done" IS NULL AND "completed" IS NOT NULL'))
                except Exception:
                    pass
                try:
                    conn.execute(text('UPDATE "tasks" SET "completed" = "done" WHERE "completed" IS NULL AND "done" IS NOT NULL'))
                except Exception:
                    pass

    # ---- legacy type fixes (Railway/Postgres) ----
    _ensure_varchar("users", "id")
    _ensure_varchar("tasks", "user_id")
    _ensure_varchar("lists", "user_id")

    _ensure_user_fks()

    # ---- add missing columns (idempotent) ----
    add_missing_columns(
        "tasks",
        {
            "note": "TEXT",
            "description": "TEXT DEFAULT ''",
            # legacy compatibility column (ok to have extra column)
            "completed": "BOOLEAN DEFAULT FALSE",
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
        },
        backfill_sql=[
            'UPDATE "tasks" SET "note" = "description" WHERE "note" IS NULL AND "description" IS NOT NULL',
            'UPDATE "tasks" SET "description" = COALESCE("note", \'\') WHERE "description" IS NULL',
            # keep columns aligned if legacy schema had `completed`
            'UPDATE "tasks" SET "done" = "completed" WHERE "done" IS NULL AND "completed" IS NOT NULL',
        ],
    )

    # If tags/subtasks exist with wrong types, try to coerce to JSONB so inserts don't mismatch
    _ensure_jsonb("tasks", "tags")
    _ensure_jsonb("tasks", "subtasks")

    add_missing_columns(
        "lists",
        {
            "title": "VARCHAR",
            "color": "VARCHAR",
            "created_at": "TIMESTAMP",
        },
        backfill_sql=[
            'UPDATE "lists" SET "title" = "name" WHERE "title" IS NULL AND "name" IS NOT NULL',
        ],
    )

    add_missing_columns(
        "reminders",
        {
            "status": "VARCHAR DEFAULT 'scheduled'",
            "method": "VARCHAR DEFAULT 'telegram'",
            "at": "TIMESTAMP",
            "task_id": "INTEGER",
            "created_at": "TIMESTAMP",
            "updated_at": "TIMESTAMP",
        },
    )

    # Ensure defaults/constraints after potential ADD COLUMN
    _ensure_description_default()
    _ensure_completed_default()
