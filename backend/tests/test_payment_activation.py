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
