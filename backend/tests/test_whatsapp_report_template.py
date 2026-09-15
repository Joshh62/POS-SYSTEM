import json

import pytest

from app import whatsapp_report


class _Messages:
    def __init__(self):
        self.kwargs = None

    def create(self, **kwargs):
        self.kwargs = kwargs
        return object()


class _Client:
    def __init__(self):
        self.messages = _Messages()


def test_daily_report_template_configuration_is_required(monkeypatch):
    monkeypatch.delenv("WHATSAPP_DAILY_REPORT_CONTENT_SID", raising=False)
    with pytest.raises(RuntimeError, match="CONTENT_SID is required"):
        whatsapp_report._daily_report_content_sid()

    monkeypatch.setenv("WHATSAPP_DAILY_REPORT_CONTENT_SID", "invalid")
    with pytest.raises(RuntimeError, match="must start with HX"):
        whatsapp_report._daily_report_content_sid()


def test_daily_report_uses_template_and_optional_status_callback(monkeypatch):
    monkeypatch.setenv("TWILIO_WHATSAPP_FROM", "whatsapp:+2348100000000")
    monkeypatch.setenv("WHATSAPP_DAILY_REPORT_CONTENT_SID", "HXtest")
    monkeypatch.setenv(
        "TWILIO_WHATSAPP_STATUS_CALLBACK_URL",
        "https://api.example.test/webhooks/twilio/whatsapp-status",
    )
    client = _Client()
    variables = {"1": "Test Shop", "2": "Monday, 15 September 2026"}

    whatsapp_report._send_daily_report_message(
        client,
        to_number="whatsapp:+2348100000001",
        variables=variables,
    )

    assert client.messages.kwargs == {
        "from_": "whatsapp:+2348100000000",
        "to": "whatsapp:+2348100000001",
        "content_sid": "HXtest",
        "content_variables": json.dumps(variables, ensure_ascii=False),
        "status_callback": "https://api.example.test/webhooks/twilio/whatsapp-status",
    }


def test_daily_report_omits_unconfigured_status_callback(monkeypatch):
    monkeypatch.setenv("TWILIO_WHATSAPP_FROM", "whatsapp:+2348100000000")
    monkeypatch.setenv("WHATSAPP_DAILY_REPORT_CONTENT_SID", "HXtest")
    monkeypatch.delenv("TWILIO_WHATSAPP_STATUS_CALLBACK_URL", raising=False)
    client = _Client()

    whatsapp_report._send_daily_report_message(
        client,
        to_number="whatsapp:+2348100000001",
        variables={"1": "Test Shop"},
    )

    assert "status_callback" not in client.messages.kwargs


def test_production_sender_must_be_explicitly_configured(monkeypatch):
    monkeypatch.delenv("TWILIO_WHATSAPP_FROM", raising=False)
    with pytest.raises(RuntimeError, match="TWILIO_WHATSAPP_FROM is required"):
        whatsapp_report._whatsapp_from_number()

    monkeypatch.setenv("TWILIO_WHATSAPP_FROM", "+2348100000000")
    with pytest.raises(RuntimeError, match=r"whatsapp:\+E164"):
        whatsapp_report._whatsapp_from_number()
