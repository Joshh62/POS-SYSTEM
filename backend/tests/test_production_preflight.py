import json

from scripts import production_preflight


def test_preflight_refuses_to_run_without_explicit_read_only_confirmation(
    monkeypatch, capsys
):
    monkeypatch.setenv("DATABASE_URL", "postgresql://must-not-be-opened")
    monkeypatch.delenv("PROFITTRACK_PREFLIGHT_CONFIRM", raising=False)

    assert production_preflight.main() == 1
    output = json.loads(capsys.readouterr().out)
    assert output == {
        "status": "refused",
        "reason": "explicit read-only confirmation is required",
    }


def test_preflight_does_not_echo_database_url_on_connection_failure(
    monkeypatch, capsys
):
    secret_url = "not-a-valid-sqlalchemy-url-with-secret"
    monkeypatch.setenv("DATABASE_URL", secret_url)
    monkeypatch.setenv(
        "PROFITTRACK_PREFLIGHT_CONFIRM",
        production_preflight.CONFIRMATION,
    )

    assert production_preflight.main() == 1
    output = capsys.readouterr().out
    assert secret_url not in output
    assert json.loads(output)["status"] == "error"
