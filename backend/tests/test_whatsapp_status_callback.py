from twilio.request_validator import RequestValidator
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_whatsapp_status_callback_rejects_missing_signature(monkeypatch):
    monkeypatch.setenv("TWILIO_AUTH_TOKEN", "test-token")
    monkeypatch.setenv(
        "TWILIO_WHATSAPP_STATUS_CALLBACK_URL",
        "https://api.example.test/webhooks/twilio/whatsapp-status",
    )

    response = client.post(
        "/webhooks/twilio/whatsapp-status",
        data={"MessageSid": "SM123", "MessageStatus": "delivered"},
    )

    assert response.status_code == 403


def test_whatsapp_status_callback_accepts_valid_twilio_signature(monkeypatch):
    token = "test-token"
    callback_url = "https://api.example.test/webhooks/twilio/whatsapp-status"
    fields = {"MessageSid": "SM123", "MessageStatus": "delivered"}
    signature = RequestValidator(token).compute_signature(callback_url, fields)
    monkeypatch.setenv("TWILIO_AUTH_TOKEN", token)
    monkeypatch.setenv("TWILIO_WHATSAPP_STATUS_CALLBACK_URL", callback_url)

    response = client.post(
        "/webhooks/twilio/whatsapp-status",
        data=fields,
        headers={"X-Twilio-Signature": signature},
    )

    assert response.status_code == 204
