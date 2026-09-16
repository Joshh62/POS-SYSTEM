# app/database.py
#
# Standard SQLAlchemy setup with RLS support.
#
# The RLS context variable (rls_business_id_ctx) is set by RLSMiddleware
# on every request. The before_cursor_execute event listener reads it and
# issues SET app.current_business_id = '<value>' before every SQL statement,
# so PostgreSQL RLS policies always have the correct tenant context.

import os
from contextvars import ContextVar
from sqlalchemy import create_engine, event, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:password@localhost/posdb")


def _positive_int(environment, name, default):
    raw_value = environment.get(name, str(default))
    try:
        value = int(raw_value)
    except (TypeError, ValueError) as exc:
        raise RuntimeError(f"{name} must be a positive integer") from exc
    if value <= 0:
        raise RuntimeError(f"{name} must be a positive integer")
    return value


def database_engine_options(environment=None):
    """Return bounded runtime-pool settings without exposing connection data."""
    environment = os.environ if environment is None else environment
    return {
        "pool_pre_ping": True,
        "pool_size": _positive_int(environment, "DATABASE_POOL_SIZE", 10),
        "max_overflow": _positive_int(
            environment, "DATABASE_MAX_OVERFLOW", 20
        ),
        "pool_timeout": _positive_int(
            environment, "DATABASE_POOL_TIMEOUT_SECONDS", 30
        ),
        "pool_recycle": _positive_int(
            environment, "DATABASE_POOL_RECYCLE_SECONDS", 300
        ),
        "pool_use_lifo": True,
        "connect_args": {
            "keepalives": 1,
            "keepalives_idle": _positive_int(
                environment, "DATABASE_KEEPALIVES_IDLE_SECONDS", 30
            ),
            "keepalives_interval": _positive_int(
                environment, "DATABASE_KEEPALIVES_INTERVAL_SECONDS", 10
            ),
            "keepalives_count": _positive_int(
                environment, "DATABASE_KEEPALIVES_COUNT", 5
            ),
        },
    }


engine = create_engine(
    DATABASE_URL,
    **database_engine_options(),
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# ── RLS context variable ──────────────────────────────────────────────────────
# Stores the current request's business_id.
# -1 = unauthenticated (no rows visible)
#  0 = superadmin (all rows visible, RLS bypassed)
# >0 = normal tenant (only their rows visible)

_rls_business_id: ContextVar[int] = ContextVar("rls_business_id", default=-1)


def set_rls_business_id(business_id: int):
    """
    Set the RLS business_id for the current async context.
    Called by RLSMiddleware at the start of every request.
    Returns the token so it can be reset if needed.
    """
    return _rls_business_id.set(business_id)


def get_rls_business_id() -> int:
    return _rls_business_id.get()


# ── SQLAlchemy connection event — sets business_id before every statement ─────
@event.listens_for(engine, "before_cursor_execute")
def set_rls_context(conn, cursor, statement, parameters, context, executemany):
    """
    Fires before every SQL statement on this connection.
    Sets the PostgreSQL session variable that RLS policies read.

    Uses SET LOCAL so the variable is scoped to the current transaction
    and automatically cleared when the transaction ends.
    """
    business_id = get_rls_business_id()
    cursor.execute(f"SET LOCAL app.current_business_id = '{business_id}'")


# ── Dependency ────────────────────────────────────────────────────────────────
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
