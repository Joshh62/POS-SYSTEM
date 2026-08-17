from types import SimpleNamespace

from fastapi import Response
from fastapi.testclient import TestClient

from app import main


class HealthySession:
    closed = False

    def execute(self, _statement):
        return 1

    def close(self):
        self.closed = True


class FailingSession:
    closed = False

    def execute(self, _statement):
        raise RuntimeError("postgresql://secret-host/private-database")

    def close(self):
        self.closed = True


def test_liveness_is_process_only():
    assert main.liveness_check() == {
        "status": "ok",
        "service": "profittrack-api",
        "version": "1.0.0",
    }


def test_readiness_returns_200_and_closes_healthy_database_session(monkeypatch):
    session = HealthySession()
    monkeypatch.setattr(main, "SessionLocal", lambda: session)
    response = Response()

    result = main.health_check(response)

    assert response.status_code == 200
    assert result["status"] == "ok"
    assert result["database"] == "ok"
    assert result["db_latency_ms"] is not None
    assert session.closed is True


def test_readiness_returns_sanitized_503_and_closes_failed_session(monkeypatch):
    session = FailingSession()
    monkeypatch.setattr(main, "SessionLocal", lambda: session)
    response = Response()

    result = main.health_check(response)

    assert response.status_code == 503
    assert result["status"] == "unavailable"
    assert result["database"] == "unavailable"
    assert "secret-host" not in str(result)
    assert session.closed is True


def test_platform_whatsapp_trigger_rejects_unauthenticated_request():
    client = TestClient(main.app)

    response = client.post("/reports/send-whatsapp")

    assert response.status_code == 401


def test_platform_whatsapp_trigger_dependency_is_superadmin_only():
    route = next(
        route for route in main.app.routes
        if getattr(route, "path", None) == "/reports/send-whatsapp"
    )
    dependency = route.dependant.dependencies[1].call

    superadmin = SimpleNamespace(role="superadmin")
    assert dependency(superadmin) is superadmin

    for role in ("admin", "manager", "cashier"):
        user = SimpleNamespace(role=role)
        try:
            dependency(user)
        except Exception as exc:
            assert getattr(exc, "status_code", None) == 403
        else:
            raise AssertionError(f"{role} unexpectedly passed platform trigger guard")
