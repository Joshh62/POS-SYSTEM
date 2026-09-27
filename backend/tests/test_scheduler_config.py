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


def test_other_scheduled_whatsapp_automations_are_disabled_by_default(monkeypatch):
    monkeypatch.delenv("WHATSAPP_DUE_DATE_ALERTS_ENABLED", raising=False)
    monkeypatch.delenv("WHATSAPP_MONTHLY_CREDIT_SUMMARY_ENABLED", raising=False)

    assert scheduler.scheduled_whatsapp_due_date_alerts_enabled() is False
    assert scheduler.scheduled_whatsapp_monthly_credit_summary_enabled() is False


def test_other_scheduled_whatsapp_automations_require_explicit_opt_in(monkeypatch):
    monkeypatch.setenv("WHATSAPP_DUE_DATE_ALERTS_ENABLED", "true")
    monkeypatch.setenv("WHATSAPP_MONTHLY_CREDIT_SUMMARY_ENABLED", "true")

    assert scheduler.scheduled_whatsapp_due_date_alerts_enabled() is True
    assert scheduler.scheduled_whatsapp_monthly_credit_summary_enabled() is True


def test_subscription_and_trial_jobs_always_start(monkeypatch):
    monkeypatch.setenv("WHATSAPP_SCHEDULED_REPORTS_ENABLED", "false")
    monkeypatch.setenv("WHATSAPP_DUE_DATE_ALERTS_ENABLED", "false")
    monkeypatch.setenv("WHATSAPP_MONTHLY_CREDIT_SUMMARY_ENABLED", "false")

    started = []

    class FakeLoop:
        def create_task(self, coroutine):
            started.append(coroutine.cr_code.co_name)
            coroutine.close()

    monkeypatch.setattr(scheduler.asyncio, "get_event_loop", lambda: FakeLoop())

    scheduler.start_scheduler()

    assert "trial_reminder_loop" in started
    assert "subscription_reconciliation_loop" in started
    assert "daily_report_loop" not in started
