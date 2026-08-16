from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.dependencies import (
    get_active_branch_id,
    get_active_business_id,
    require_role,
)


def user(role: str, branch_id: int = 10, business_id: int = 20):
    return SimpleNamespace(
        role=role,
        branch_id=branch_id,
        business_id=business_id,
    )


def test_cashier_is_denied_admin_only_role():
    checker = require_role(["admin", "manager"])

    with pytest.raises(HTTPException) as exc:
        checker(user("cashier"))

    assert exc.value.status_code == 403
    assert exc.value.detail == "Not authorized"


def test_superadmin_bypasses_role_guard():
    current = user("superadmin", branch_id=None, business_id=None)
    checker = require_role(["admin"])

    assert checker(current) is current


def test_manager_cannot_override_assigned_branch():
    current = user("manager", branch_id=10, business_id=20)

    assert get_active_branch_id(current, branch_id_param=999) == 10


def test_cashier_cannot_override_assigned_branch():
    current = user("cashier", branch_id=11, business_id=20)

    assert get_active_branch_id(current, branch_id_param=999) == 11


def test_admin_query_remains_scoped_to_own_business():
    current = user("admin", branch_id=10, business_id=20)

    assert get_active_business_id(current, business_id_param=999) == 20


def test_manager_query_remains_scoped_to_own_business():
    current = user("manager", branch_id=10, business_id=21)

    assert get_active_business_id(current, business_id_param=999) == 21


def test_superadmin_may_explicitly_scope_business():
    current = user("superadmin", branch_id=None, business_id=None)

    assert get_active_business_id(current, business_id_param=999) == 999
