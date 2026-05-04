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

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,       # reconnect on stale connections
    pool_size=10,
    max_overflow=20,
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