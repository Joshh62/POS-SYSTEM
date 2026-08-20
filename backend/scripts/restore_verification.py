"""Read-only verification for an isolated ProfitTrack recovery branch.

This module never creates, migrates, restores, or mutates a database. The
operator must first create a non-production Neon branch from a past point in
time, then run this verifier against that branch.
"""

from __future__ import annotations

import json
import os
import re
import sys
from contextlib import closing
from datetime import datetime, timezone

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url

from scripts.production_preflight import collect_preflight


CONFIRMATION = "VERIFY_ISOLATED_RESTORE_BRANCH"
TARGET_CLASSIFICATION = "isolated-non-production-recovery-branch"
EXPECTED_ALEMBIC_REVISION = "0025_expense_ledger_guard"
BRANCH_NAME_RE = re.compile(r"^(restore|recovery|dr)-[a-z0-9][a-z0-9-]{2,62}$")


class VerificationRefused(ValueError):
    """Raised when the operator has not satisfied a safety gate."""


def _parse_restore_point(raw_value: str) -> datetime:
    value = raw_value.strip()
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError as exc:
        raise VerificationRefused(
            "PROFITTRACK_RESTORE_POINT_UTC must be an ISO-8601 timestamp"
        ) from exc
    if parsed.tzinfo is None:
        raise VerificationRefused(
            "PROFITTRACK_RESTORE_POINT_UTC must include a timezone"
        )
    parsed = parsed.astimezone(timezone.utc)
    if parsed > datetime.now(timezone.utc):
        raise VerificationRefused(
            "PROFITTRACK_RESTORE_POINT_UTC cannot be in the future"
        )
    return parsed


def validate_environment(environ: dict[str, str]) -> dict:
    """Validate non-production targeting without returning connection secrets."""
    if environ.get("PROFITTRACK_RESTORE_CONFIRM") != CONFIRMATION:
        raise VerificationRefused(
            "explicit isolated-restore confirmation is required"
        )
    if (
        environ.get("PROFITTRACK_RESTORE_TARGET_CLASSIFICATION")
        != TARGET_CLASSIFICATION
    ):
        raise VerificationRefused(
            "target must be classified as an isolated non-production recovery branch"
        )

    branch_name = environ.get("PROFITTRACK_RESTORE_BRANCH_NAME", "").strip().lower()
    if not BRANCH_NAME_RE.fullmatch(branch_name):
        raise VerificationRefused(
            "recovery branch name must start with restore-, recovery-, or dr-"
        )

    restore_point = _parse_restore_point(
        environ.get("PROFITTRACK_RESTORE_POINT_UTC", "")
    )
    database_url = environ.get("RESTORE_DATABASE_URL")
    if not database_url:
        raise VerificationRefused("RESTORE_DATABASE_URL is not set")

    try:
        parsed_url = make_url(database_url)
    except Exception as exc:
        raise VerificationRefused("RESTORE_DATABASE_URL is invalid") from exc
    if not parsed_url.drivername.startswith("postgresql"):
        raise VerificationRefused("restore verification requires PostgreSQL")
    if not parsed_url.host or not parsed_url.database:
        raise VerificationRefused(
            "RESTORE_DATABASE_URL must include a host and database"
        )

    protected_host = environ.get("PROFITTRACK_PRODUCTION_DB_HOST", "").strip().lower()
    if not protected_host:
        raise VerificationRefused(
            "PROFITTRACK_PRODUCTION_DB_HOST is required as a protected target"
        )
    if parsed_url.host.lower() == protected_host:
        raise VerificationRefused(
            "restore verification refuses the protected production database host"
        )

    return {
        "branch_name": branch_name,
        "restore_point_utc": restore_point.isoformat().replace("+00:00", "Z"),
        "database_url": database_url,
        "expected_revision": environ.get(
            "PROFITTRACK_EXPECTED_ALEMBIC_REVISION",
            EXPECTED_ALEMBIC_REVISION,
        ),
    }


def collect_restore_evidence(connection) -> dict:
    """Collect schema and aggregate evidence without returning row values."""
    preflight = collect_preflight(connection)
    public_tables = sorted(inspect(connection).get_table_names(schema="public"))
    return {
        "alembic_revision": preflight.get("alembic_revision"),
        "missing_required_tables": preflight.get("missing_required_tables", []),
        "blockers": preflight.get("blockers", {}),
        "warnings": preflight.get("warnings", {}),
        "blocker_total": preflight.get("blocker_total", 0),
        "warning_total": preflight.get("warning_total", 0),
        "public_table_count": len(public_tables),
    }


def verify_restore(plan: dict) -> tuple[dict, int]:
    """Open a read-only transaction and assess the restored branch."""
    engine = create_engine(plan["database_url"], pool_pre_ping=True)
    try:
        with closing(engine.connect()) as connection:
            transaction = connection.begin()
            try:
                connection.execute(text("SET TRANSACTION READ ONLY"))
                evidence = collect_restore_evidence(connection)
            finally:
                transaction.rollback()
    finally:
        engine.dispose()

    revision_matches = (
        evidence["alembic_revision"] == plan["expected_revision"]
    )
    status = (
        "verified"
        if revision_matches and evidence["blocker_total"] == 0
        else "blocked"
    )
    result = {
        "status": status,
        "mode": "read-only-isolated-restore-verification",
        "branch_name": plan["branch_name"],
        "restore_point_utc": plan["restore_point_utc"],
        "expected_alembic_revision": plan["expected_revision"],
        "alembic_revision": evidence["alembic_revision"],
        "revision_matches": revision_matches,
        "public_table_count": evidence["public_table_count"],
        "missing_required_tables": evidence["missing_required_tables"],
        "blockers": evidence["blockers"],
        "blocker_total": evidence["blocker_total"],
        "warnings": evidence["warnings"],
        "warning_total": evidence["warning_total"],
    }
    return result, 0 if status == "verified" else 2


def main() -> int:
    try:
        plan = validate_environment(dict(os.environ))
    except VerificationRefused as exc:
        print(json.dumps({"status": "refused", "reason": str(exc)}))
        return 1

    try:
        result, exit_code = verify_restore(plan)
    except Exception as exc:
        print(json.dumps({
            "status": "error",
            "error_type": type(exc).__name__,
        }))
        return 1

    print(json.dumps(result, indent=2, sort_keys=True))
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
