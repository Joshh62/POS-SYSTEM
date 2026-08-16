from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.routers import sales


class FakeQuery:
    def __init__(self, *, first_result=None, rows=None):
        self.first_result = first_result
        self.rows = rows or []

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return self.first_result

    def all(self):
        return self.rows


class FakeDB:
    def __init__(self, *, sale=None, items=None, inventory=None, product=None, branches=None):
        self.sale = sale
        self.items = items or []
        self.inventory = inventory
        self.product = product
        self.branches = branches or []
        self.added = []
        self.committed = False
        self.rolled_back = False

    def query(self, model):
        if model is sales.models.Sale:
            return FakeQuery(first_result=self.sale)
        if model is sales.models.SaleItem:
            return FakeQuery(rows=self.items)
        if model is sales.models.BranchInventory:
            return FakeQuery(first_result=self.inventory)
        if model is sales.models.Product:
            return FakeQuery(first_result=self.product)
        if model is sales.models.Branch:
            return FakeQuery(rows=self.branches)
        return FakeQuery()

    def add(self, obj):
        self.added.append(obj)

    def commit(self):
        self.committed = True

    def rollback(self):
        self.rolled_back = True


def fake_model(**kwargs):
    return SimpleNamespace(**kwargs)


@pytest.fixture(autouse=True)
def patch_refund_models(monkeypatch):
    monkeypatch.setattr(sales.models, "Refund", fake_model)
    monkeypatch.setattr(sales.models, "InventoryMovement", fake_model)
    monkeypatch.setattr(sales.models, "AuditLog", fake_model)


def make_user(role="manager", branch_id=10, business_id=20):
    return SimpleNamespace(user_id=7, role=role, branch_id=branch_id, business_id=business_id)


def make_sale(status="completed", branch_id=10, total_amount=5000):
    return SimpleNamespace(sale_id=100, status=status, branch_id=branch_id, total_amount=total_amount)


def make_item(quantity=2, product_id=1):
    return SimpleNamespace(sale_id=100, product_id=product_id, quantity=quantity)


def test_refund_rejects_cross_branch_manager_before_inventory_mutation():
    sale = make_sale(branch_id=99)
    inventory = SimpleNamespace(product_id=1, branch_id=99, stock_quantity=3)
    db = FakeDB(sale=sale, items=[make_item()], inventory=inventory)

    with pytest.raises(HTTPException) as exc:
        sales.refund_sale(sale_id=100, reason="Customer return", db=db, user=make_user(branch_id=10))

    assert exc.value.status_code == 403
    assert inventory.stock_quantity == 3
    assert db.added == []
    assert db.committed is False


def test_refund_rejects_admin_sale_outside_own_business():
    sale = make_sale(branch_id=99)
    foreign_branch = SimpleNamespace(branch_id=50, business_id=20)
    db = FakeDB(sale=sale, items=[make_item()], branches=[foreign_branch])

    with pytest.raises(HTTPException) as exc:
        sales.refund_sale(sale_id=100, reason="Customer return", db=db, user=make_user(role="admin", branch_id=50, business_id=20))

    assert exc.value.status_code == 403
    assert db.added == []
    assert db.committed is False


def test_refund_rejects_duplicate_before_mutation():
    sale = make_sale(status="refunded")
    db = FakeDB(sale=sale, items=[make_item()])

    with pytest.raises(HTTPException) as exc:
        sales.refund_sale(sale_id=100, reason="Duplicate", db=db, user=make_user())

    assert exc.value.status_code == 400
    assert exc.value.detail == "Sale already refunded"
    assert db.added == []
    assert db.committed is False


def test_refund_fails_if_inventory_record_is_missing_and_rolls_back():
    sale = make_sale()
    item = make_item(quantity=2)
    product = SimpleNamespace(product_id=1, product_name="Rice")
    db = FakeDB(sale=sale, items=[item], inventory=None, product=product)

    with pytest.raises(HTTPException) as exc:
        sales.refund_sale(sale_id=100, reason="Customer return", db=db, user=make_user())

    assert exc.value.status_code in {404, 409}
    assert sale.status == "completed"
    assert db.rolled_back is True
    assert db.committed is False


def test_successful_refund_restores_inventory_records_movement_and_commits():
    sale = make_sale(total_amount=5000)
    item = make_item(quantity=2)
    inventory = SimpleNamespace(product_id=1, branch_id=10, stock_quantity=3)
    product = SimpleNamespace(product_id=1, product_name="Rice")
    db = FakeDB(sale=sale, items=[item], inventory=inventory, product=product)

    result = sales.refund_sale(sale_id=100, reason="Customer return", db=db, user=make_user())

    assert result == {"message": "Sale refunded successfully"}
    assert inventory.stock_quantity == 5
    assert sale.status == "refunded"
    assert db.committed is True
    assert db.rolled_back is False

    movement = next(obj for obj in db.added if getattr(obj, "movement_type", None) == "REFUND")
    assert movement.reference_id == 100
    assert movement.quantity == 2

    refund = next(obj for obj in db.added if hasattr(obj, "reason") and hasattr(obj, "amount"))
    assert refund.sale_id == 100
    assert refund.reason == "Customer return"
    assert refund.amount == 5000
