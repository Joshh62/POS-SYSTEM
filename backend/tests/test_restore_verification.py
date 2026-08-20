import json
from datetime import datetime, timedelta, timezone

import pytest

from scripts import restore_verification


def valid_environment():
    return {
        "PROFITTRACK_RESTORE_CONFIRM": (
            restore_verification.CONFIRMATION
        ),
        "PROFITTRACK_RESTORE_TARGET_CLASSIFICATION": (
            restore_verification.TARGET_CLASSIFICATION
        ),
        "PROFITTRACK_RESTORE_BRANCH_NAME": "restore-20260820-1200",
        "PROFITTRACK_RESTORE_POINT_UTC": (
            datetime.now(timezone.utc) - timedelta(minutes=10)
        ).isoformat(),
        "PROFITTRACK_PRODUCTION_DB_HOST": "ep-production.neon.tech",
        "RESTORE_DATABASE_URL": (
            "postgresql://restore:secret@"
            "ep-recovery.neon.tech/neondb?sslmode=require"
        ),
    }


def test_restore_verification_refuses_without_explicit_confirmation():
    environ = valid_environment()
    environ.pop("PROFITTRACK_RESTORE_CONFIRM")

    with pytest.raises(restore_verification.VerificationRefused):
        restore_verification.validate_environment(environ)


def test_restore_verification_refuses_unclassified_or_badly_named_target():
    environ = valid_environment()
    environ["PROFITTRACK_RESTORE_TARGET_CLASSIFICATION"] = "production"
    with pytest.raises(restore_verification.VerificationRefused):
        restore_verification.validate_environment(environ)

    environ = valid_environment()
    environ["PROFITTRACK_RESTORE_BRANCH_NAME"] = "production"
    with pytest.raises(restore_verification.VerificationRefused):
        restore_verification.validate_environment(environ)


def test_restore_verification_refuses_production_host():
    environ = valid_environment()
    environ["RESTORE_DATABASE_URL"] = (
        "postgresql://restore:secret@"
        "ep-production.neon.tech/neondb?sslmode=require"
    )

    with pytest.raises(
        restore_verification.VerificationRefused,
        match="protected production database host",
    ):
        restore_verification.validate_environment(environ)


def test_restore_verification_requires_past_timezone_aware_restore_point():
    environ = valid_environment()
    environ["PROFITTRACK_RESTORE_POINT_UTC"] = "2026-08-20T12:00:00"
    with pytest.raises(restore_verification.VerificationRefused):
        restore_verification.validate_environment(environ)

    environ = valid_environment()
    environ["PROFITTRACK_RESTORE_POINT_UTC"] = (
        datetime.now(timezone.utc) + timedelta(hours=1)
    ).isoformat()
    with pytest.raises(restore_verification.VerificationRefused):
        restore_verification.validate_environment(environ)


def test_restore_verification_does_not_echo_database_url_on_failure(
    monkeypatch, capsys
):
    secret_url = (
        "postgresql://restore:do-not-print@"
        "ep-recovery.neon.tech/neondb?sslmode=require"
    )
    for key, value in valid_environment().items():
        monkeypatch.setenv(key, value)
    monkeypatch.setenv("RESTORE_DATABASE_URL", secret_url)

    def fail(_plan):
        raise RuntimeError("connection failed")

    monkeypatch.setattr(restore_verification, "verify_restore", fail)

    assert restore_verification.main() == 1
    output = capsys.readouterr().out
    assert secret_url not in output
    assert "do-not-print" not in output
    assert json.loads(output) == {
        "status": "error",
        "error_type": "RuntimeError",
    }


def test_restore_verification_reports_verified_aggregate_evidence(
    monkeypatch, capsys
):
    for key, value in valid_environment().items():
        monkeypatch.setenv(key, value)

    def verified(plan):
        assert plan["branch_name"] == "restore-20260820-1200"
        return ({
            "status": "verified",
            "mode": "read-only-isolated-restore-verification",
            "branch_name": plan["branch_name"],
            "blocker_total": 0,
        }, 0)

    monkeypatch.setattr(restore_verification, "verify_restore", verified)

    assert restore_verification.main() == 0
    output = json.loads(capsys.readouterr().out)
    assert output["status"] == "verified"
    assert output["blocker_total"] == 0
