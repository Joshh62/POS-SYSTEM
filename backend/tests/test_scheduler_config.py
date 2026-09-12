from app import scheduler


def test_scheduled_whatsapp_reports_are_disabled_by_default(monkeypatch):
    monkeypatch.delenv("WHATSAPP_SCHEDULED_REPORTS_ENABLED", raising=False)

    assert scheduler.scheduled_whatsapp_reports_enabled() is False


def test_scheduled_whatsapp_reports_require_explicit_opt_in(monkeypatch):
    for value in ("1", "true", "TRUE", "yes", "on"):
        monkeypatch.setenv("WHATSAPP_SCHEDULED_REPORTS_ENABLED", value)
        assert scheduler.scheduled_whatsapp_reports_enabled() is True


def test_unrecognized_scheduled_report_setting_stays_disabled(monkeypatch):
    monkeypatch.setenv("WHATSAPP_SCHEDULED_REPORTS_ENABLED", "enabled")

    assert scheduler.scheduled_whatsapp_reports_enabled() is False
