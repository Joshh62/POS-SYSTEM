"""Database URL selection helpers.

Runtime application traffic uses ``DATABASE_URL``.  Schema migrations may use
the direct database endpoint supplied in ``MIGRATION_DATABASE_URL``; the
runtime URL remains a backwards-compatible fallback for local development.
"""

import os
from collections.abc import Mapping


def migration_database_url(environ: Mapping[str, str] | None = None) -> str:
    """Return the configured migration URL without logging its value."""
    environment = os.environ if environ is None else environ
    url = environment.get("MIGRATION_DATABASE_URL") or environment.get(
        "DATABASE_URL"
    )
    if not url:
        raise RuntimeError(
            "[Alembic] MIGRATION_DATABASE_URL or DATABASE_URL must be set"
        )
    return url


def psycopg2_url(url: str) -> str:
    """Select psycopg2 without altering already explicit driver URLs."""
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg2://", 1)
    return url
