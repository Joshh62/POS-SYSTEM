from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app import dependencies, models
from app.utils.subscriptions import (
    PAST_DUE_GRACE_DAYS,
    effective_subscription_status,
    reconcile_business_subscription,
    subscription_has_access,
    subscription_snapshot,
    utcnow,
)
from app import whatsapp_report


NOW = datetime(2026, 9, 27, 12, 0, 0)


def business(**overrides):
    values = {
        "subscription_status": "trial",
        "trial_ends_at": NOW + timedelta(days=1),
        "current_period_end": None,
        "plan": "starter",
        "pending_plan": None,
        "pending_billing": None,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_active_trial_remains_available_without_mutation():
    tenant = business()

    result = reconcile_business_subscription(tenant, NOW)

    assert result.changed is False
    assert result.current_status == "trial"
    assert subscription_has_access(tenant, NOW) is True
    assert subscription_snapshot(tenant, NOW)["trial_days_left"] == 1


def test_expired_trial_is_persisted_and_blocked():
    tenant = business(trial_ends_at=NOW)

    result = reconcile_business_subscription(tenant, NOW)

    assert result.changed is True
    assert result.trial_expired is True
    assert tenant.subscription_status == "expired"
    assert subscription_has_access(tenant, NOW) is False


def test_active_paid_period_without_end_remains_active_for_legacy_accounts():
    tenant = business(subscription_status="active", trial_ends_at=None)

    assert effective_subscription_status(tenant, NOW) == "active"
    assert subscription_has_access(tenant, NOW) is True


def test_paid_period_expires_at_period_end():
    tenant = business(
        subscription_status="active",
        trial_ends_at=None,
        current_period_end=NOW,
    )

    reconcile_business_subscription(tenant, NOW)

    assert tenant.subscription_status == "expired"
    assert subscription_has_access(tenant, NOW) is False


def test_cancelled_subscription_keeps_access_only_until_period_end():
    tenant = business(
        subscription_status="cancelled",
        trial_ends_at=None,
        current_period_end=NOW + timedelta(seconds=1),
    )
    assert subscription_has_access(tenant, NOW) is True

    reconcile_business_subscription(tenant, NOW + timedelta(seconds=1))
    assert tenant.subscription_status == "expired"
    assert subscription_has_access(tenant, NOW + timedelta(seconds=1)) is False


def test_past_due_subscription_honours_three_day_grace_period():
    tenant = business(
        subscription_status="past_due",
        trial_ends_at=None,
        current_period_end=NOW,
    )
    assert PAST_DUE_GRACE_DAYS == 3
    assert subscription_has_access(tenant, NOW + timedelta(days=2)) is True

    reconcile_business_subscription(tenant, NOW + timedelta(days=3))
    assert tenant.subscription_status == "expired"


def test_pending_downgrade_applies_before_period_expiry():
    tenant = business(
        subscription_status="active",
        trial_ends_at=None,
        current_period_end=NOW,
        plan="business",
        pending_plan="starter",
        pending_billing="monthly",
    )

    result = reconcile_business_subscription(tenant, NOW)

    assert result.changed is True
    assert tenant.plan == "starter"
    assert tenant.pending_plan is None
    assert tenant.pending_billing is None
    assert tenant.subscription_status == "expired"


def test_superadmin_style_active_account_is_not_affected_by_trial_dates():
    tenant = business(
        subscription_status="active",
        trial_ends_at=NOW - timedelta(days=90),
        current_period_end=None,
    )

    result = reconcile_business_subscription(tenant, NOW)

    assert result.changed is False
    assert tenant.subscription_status == "active"


def test_expired_trial_cannot_qualify_for_whatsapp_report_before_sweep():
    tenant = business(trial_ends_at=NOW - timedelta(seconds=1))

    assert whatsapp_report._business_qualifies_for_report(tenant) is False


def test_active_trial_still_qualifies_for_whatsapp_report():
    tenant = business(trial_ends_at=utcnow() + timedelta(days=1))

    assert whatsapp_report._business_qualifies_for_report(tenant) is True


class FakeQuery:
    def __init__(self, value):
        self.value = value

    def filter(self, *args):
        return self

    def first(self):
        return self.value


class FakeSession:
    def __init__(self, user, tenant):
        self.user = user
        self.tenant = tenant
        self.commits = 0
        self.queries = []

    def query(self, model):
        self.queries.append(model)
        if model is models.User:
            return FakeQuery(self.user)
        if model is models.Business:
            return FakeQuery(self.tenant)
        raise AssertionError(f"Unexpected model query: {model}")

    def commit(self):
        self.commits += 1


def auth_user(role="admin"):
    return SimpleNamespace(
        username="tenant-admin",
        role=role,
        is_active=True,
        business_id=17 if role != "superadmin" else None,
        branch_id=18 if role != "superadmin" else None,
    )


def test_existing_token_is_blocked_and_expiry_is_persisted(monkeypatch):
    user = auth_user()
    tenant = business(trial_ends_at=NOW - timedelta(seconds=1))
    db = FakeSession(user, tenant)
    monkeypatch.setattr(
        dependencies.jwt,
        "decode",
        lambda *args, **kwargs: {"sub": user.username},
    )

    with pytest.raises(HTTPException) as exc:
        dependencies.get_current_user(token="token", db=db)

    assert exc.value.status_code == 403
    assert tenant.subscription_status == "expired"
    assert db.commits == 1


def test_active_tenant_request_remains_unchanged(monkeypatch):
    user = auth_user()
    tenant = business(trial_ends_at=utcnow() + timedelta(days=1))
    db = FakeSession(user, tenant)
    monkeypatch.setattr(
        dependencies.jwt,
        "decode",
        lambda *args, **kwargs: {"sub": user.username},
    )

    assert dependencies.get_current_user(token="token", db=db) is user
    assert db.commits == 0


def test_superadmin_bypasses_tenant_subscription_lookup(monkeypatch):
    user = auth_user(role="superadmin")
    db = FakeSession(user, None)
    monkeypatch.setattr(
        dependencies.jwt,
        "decode",
        lambda *args, **kwargs: {"sub": user.username},
    )

    assert dependencies.get_current_user(token="token", db=db) is user
    assert db.queries == [models.User]
