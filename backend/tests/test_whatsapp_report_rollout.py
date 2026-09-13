from types import SimpleNamespace

import pytest

from app import whatsapp_report


def _business(business_id):
    return SimpleNamespace(business_id=business_id)


def test_daily_report_rollout_is_disabled_without_explicit_scope(monkeypatch):
    monkeypatch.delenv("WHATSAPP_DAILY_REPORT_CANARY_BUSINESS_ID", raising=False)
    monkeypatch.delenv("WHATSAPP_DAILY_REPORT_GLOBAL_AUTHORIZED", raising=False)

    assert whatsapp_report._scope_daily_report_businesses([_business(1)]) == []


def test_daily_report_rollout_selects_only_canary_business(monkeypatch):
    monkeypatch.setenv("WHATSAPP_DAILY_REPORT_CANARY_BUSINESS_ID", "2")
    monkeypatch.delenv("WHATSAPP_DAILY_REPORT_GLOBAL_AUTHORIZED", raising=False)
    businesses = [_business(1), _business(2), _business(3)]

    selected = whatsapp_report._scope_daily_report_businesses(businesses)

    assert [business.business_id for business in selected] == [2]


def test_daily_report_rollout_requires_positive_integer_canary(monkeypatch):
    monkeypatch.setenv("WHATSAPP_DAILY_REPORT_CANARY_BUSINESS_ID", "invalid")
    monkeypatch.delenv("WHATSAPP_DAILY_REPORT_GLOBAL_AUTHORIZED", raising=False)

    with pytest.raises(RuntimeError, match="must be an integer"):
        whatsapp_report._scope_daily_report_businesses([_business(1)])

    monkeypatch.setenv("WHATSAPP_DAILY_REPORT_CANARY_BUSINESS_ID", "0")
    with pytest.raises(RuntimeError, match="must be positive"):
        whatsapp_report._scope_daily_report_businesses([_business(1)])


def test_daily_report_rollout_allows_explicit_global_authorization(monkeypatch):
    monkeypatch.delenv("WHATSAPP_DAILY_REPORT_CANARY_BUSINESS_ID", raising=False)
    monkeypatch.setenv("WHATSAPP_DAILY_REPORT_GLOBAL_AUTHORIZED", "true")
    businesses = [_business(1), _business(2)]

    assert whatsapp_report._scope_daily_report_businesses(businesses) == businesses


def test_daily_report_rollout_rejects_conflicting_authorizations(monkeypatch):
    monkeypatch.setenv("WHATSAPP_DAILY_REPORT_CANARY_BUSINESS_ID", "1")
    monkeypatch.setenv("WHATSAPP_DAILY_REPORT_GLOBAL_AUTHORIZED", "true")

    with pytest.raises(RuntimeError, match="cannot both be authorized"):
        whatsapp_report._scope_daily_report_businesses([_business(1)])
