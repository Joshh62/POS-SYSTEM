"""Expired subscription billing email regression tests (no live database or Paystack)."""
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from fastapi import HTTPException

from app import models
from app.routers import payments


class FakeDB:
    def __init__(self, business):
        self.business = business
        self.commits = 0

    def query(self, model):
        assert model is models.Business
        return self

    def filter(self, *args):
        return self

    def first(self):
        return self.business

    def commit(self):
        self.commits += 1


@pytest.mark.parametrize("role,expected_email", [
    ("admin", "billing@example.com"),
    ("cashier", None),
    ("manager", None),
])
def test_subscription_email_is_available_to_expired_admin_only(monkeypatch, role, expected_email):
    business = SimpleNamespace(
        business_id=21, email="billing@example.com", plan="starter",
        current_period_end=None, pending_plan=None, pending_billing=None,
    )
    db = FakeDB(business)
    monkeypatch.setattr(payments, "reconcile_business_subscription",
                        lambda biz, now: SimpleNamespace(changed=False, trial_expired=False))
    monkeypatch.setattr(payments, "subscription_snapshot",
                        lambda biz, now: {"subscription_status": "expired"})
    monkeypatch.setattr(payments, "subscription_has_access", lambda biz, now: False)

    result = payments.get_subscription(db=db, user=SimpleNamespace(role=role, business_id=21))
    assert result["subscription_status"] == "expired"
    assert result["billing_email"] == expected_email
    assert db.commits == 0


def test_subscription_missing_email_remains_missing(monkeypatch):
    business = SimpleNamespace(
        business_id=21, email=None, plan="starter",
        current_period_end=None, pending_plan=None, pending_billing=None,
    )
    db = FakeDB(business)
    monkeypatch.setattr(payments, "reconcile_business_subscription",
                        lambda biz, now: SimpleNamespace(changed=False, trial_expired=False))
    monkeypatch.setattr(payments, "subscription_snapshot",
                        lambda biz, now: {"subscription_status": "expired"})
    monkeypatch.setattr(payments, "subscription_has_access", lambda biz, now: False)

    result = payments.get_subscription(db=db, user=SimpleNamespace(role="admin", business_id=21))
    assert result["billing_email"] == ""
