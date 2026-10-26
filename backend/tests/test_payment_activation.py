"""Payment activation validation regression tests (no live Paystack calls)."""
import pytest
from fastapi import HTTPException
from app.routers.payments import _validate_successful_payment, PLANS


def transaction(reference="ref-1", business_id=21, plan="starter", billing="monthly"):
    return {
        "status": "success", "reference": reference, "currency": "NGN",
        "amount": PLANS[plan]["monthly_price" if billing == "monthly" else "annual_price"],
        "metadata": {"business_id": business_id, "plan": plan, "billing": billing},
    }


def test_valid_payment_binds_to_expected_tenant():
    assert _validate_successful_payment(transaction(), "ref-1", 21) == (
        21, "starter", "monthly", PLANS["starter"]["monthly_price"]
    )


@pytest.mark.parametrize("mutation", [
    lambda d: d.update(status="failed"),
    lambda d: d.update(reference="different"),
    lambda d: d.update(currency="USD"),
    lambda d: d.update(amount=1),
    lambda d: d.update(amount=True),
    lambda d: d["metadata"].update(plan="unknown"),
    lambda d: d["metadata"].update(billing="weekly"),
    lambda d: d["metadata"].pop("business_id"),
])
def test_invalid_payment_cannot_activate(mutation):
    data = transaction()
    mutation(data)
    with pytest.raises(HTTPException):
        _validate_successful_payment(data, "ref-1", 21)


def test_cross_tenant_payment_is_rejected():
    with pytest.raises(HTTPException) as error:
        _validate_successful_payment(transaction(business_id=22), "ref-1", 21)
    assert error.value.status_code == 403



@pytest.mark.asyncio
async def test_initialize_requires_tenant_admin_before_paystack(monkeypatch):
    from app.routers.payments import initialize_payment, InitializePaymentRequest
    from types import SimpleNamespace

    async def should_not_call_paystack(*args, **kwargs):
        raise AssertionError("Paystack must not be called")

    monkeypatch.setattr("app.routers.payments._paystack_post", should_not_call_paystack)
    for role in ("cashier", "manager", "superadmin"):
        user = SimpleNamespace(role=role, business_id=21)
        with pytest.raises(HTTPException) as error:
            await initialize_payment(
                InitializePaymentRequest(plan="starter", billing="monthly"),
                db=None, user=user,
            )
        assert error.value.status_code == 403


@pytest.mark.asyncio
async def test_verify_requires_tenant_admin_before_paystack(monkeypatch):
    from app.routers.payments import verify_payment
    from types import SimpleNamespace

    async def should_not_call_paystack(*args, **kwargs):
        raise AssertionError("Paystack must not be called")

    monkeypatch.setattr("app.routers.payments._paystack_get", should_not_call_paystack)
    for role in ("cashier", "manager", "superadmin"):
        user = SimpleNamespace(role=role, business_id=21)
        with pytest.raises(HTTPException) as error:
            await verify_payment("ref-1", db=None, user=user)
        assert error.value.status_code == 403


@pytest.mark.asyncio
async def test_webhook_rejects_missing_secret(monkeypatch):
    from app.routers.payments import paystack_webhook
    from types import SimpleNamespace

    monkeypatch.delenv("PAYSTACK_SECRET_KEY", raising=False)

    async def body():
        return b'{"event":"charge.success"}'

    request = SimpleNamespace(body=body)
    with pytest.raises(HTTPException) as error:
        await paystack_webhook(request, db=None, x_paystack_signature=None)
    assert error.value.status_code == 503
