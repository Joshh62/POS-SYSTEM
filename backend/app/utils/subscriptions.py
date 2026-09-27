"""Authoritative subscription lifecycle rules for ProfitTrack tenants."""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta


PAST_DUE_GRACE_DAYS = 3
ACCESS_STATUSES = {"trial", "active", "past_due", "cancelled"}


def utcnow() -> datetime:
    """Return naive UTC to match the existing PostgreSQL timestamp columns."""
    return datetime.now(UTC).replace(tzinfo=None)


@dataclass(frozen=True)
class SubscriptionReconciliation:
    previous_status: str
    current_status: str
    changed: bool
    trial_expired: bool


def effective_subscription_status(business, now: datetime | None = None) -> str:
    """Return the access status implied by stored dates without mutating state."""
    now = now or utcnow()
    status = business.subscription_status or "active"

    if status == "trial":
        if business.trial_ends_at and business.trial_ends_at <= now:
            return "expired"
        return status

    period_end = business.current_period_end
    if status in {"active", "cancelled"}:
        if period_end and period_end <= now:
            return "expired"
        return status

    if status == "past_due":
        if period_end and period_end + timedelta(days=PAST_DUE_GRACE_DAYS) <= now:
            return "expired"
        return status

    return status


def reconcile_business_subscription(
    business,
    now: datetime | None = None,
) -> SubscriptionReconciliation:
    """Apply due plan/status transitions to one loaded Business model."""
    now = now or utcnow()
    previous_status = business.subscription_status or "active"
    changed = False

    # A scheduled downgrade becomes the retained plan at the paid period edge,
    # even if the subscription does not subsequently renew.
    if (
        business.pending_plan
        and business.current_period_end
        and business.current_period_end <= now
        and previous_status in {"active", "cancelled", "past_due"}
    ):
        business.plan = business.pending_plan
        business.pending_plan = None
        business.pending_billing = None
        changed = True

    current_status = effective_subscription_status(business, now)
    if current_status != previous_status:
        business.subscription_status = current_status
        changed = True

    return SubscriptionReconciliation(
        previous_status=previous_status,
        current_status=current_status,
        changed=changed,
        trial_expired=previous_status == "trial" and current_status == "expired",
    )


def subscription_snapshot(business, now: datetime | None = None) -> dict:
    """Build the API-facing subscription summary from authoritative rules."""
    if not business:
        return {
            "subscription_status": "active",
            "trial_active": False,
            "trial_days_left": 0,
            "trial_ends_at": None,
        }

    now = now or utcnow()
    status = effective_subscription_status(business, now)
    trial_active = bool(
        status == "trial"
        and business.trial_ends_at
        and business.trial_ends_at > now
    )
    trial_days_left = (
        max(0, (business.trial_ends_at - now).days)
        if trial_active
        else 0
    )
    return {
        "subscription_status": status,
        "trial_active": trial_active,
        "trial_days_left": trial_days_left,
        "trial_ends_at": (
            business.trial_ends_at.isoformat()
            if business.trial_ends_at
            else None
        ),
    }


def subscription_has_access(business, now: datetime | None = None) -> bool:
    return effective_subscription_status(business, now) in ACCESS_STATUSES
