from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app import schemas
from app.routers import sales


class FakeQuery:
    def __init__(self, result=None, rows=None):
        self.result = result
        self.rows = rows or []

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return self.result

    def all(self):
        return self.rows


class FakeDB:
    def __init__(self, *, product=None, inventory=None, branches=None):
        self.product = product
        self.inventory = inventory
        self.branches = branches or []
        self.added = []
        self.committed = False
        self.rolled_back = False

    def query(self, model):
        if model is sales.models.Product:
            return FakeQuery(result=self.product)
        if model is sales.models.BranchInventory:
            return FakeQuery(result=self.inventory)
        if model is sales.models.Branch:
            return FakeQuery(rows=self.branches)
        return FakeQuery()

    def add(self, obj):
        self.added.append(obj)

    def flush(self):
        for obj in self.added:
            if hasattr(obj, "sale_id") and getattr(obj, "sale_id", None) is None:
                obj.sale_id = 500

    def commit(self):
        self.committed = True

    def rollback(self):
        self.rolled_back = True

    def refresh(self, obj):
        return None


def fake_model(**kwargs):
    return SimpleNamespace(**kwargs)


@pytest.fixture(autouse=True)
def patch_transaction_models(monkeypatch):
    monkeypatch.setattr(sales.models, "Sale", fake_model)
    monkeypatch.setattr(sales.models, "SaleItem", fake_model)
    monkeypatch.setattr(sales.models, "InventoryMovement", fake_model)
    monkeypatch.setattr(sales.models, "AuditLog", fake_model)


def make_user(role="cashier", branch_id=10, business_id=20):
    return SimpleNamespace(
        user_id=7,
        role=role,
        branch_id=branch_id,
        business_id=business_id,
    )


def make_sale(quantity=1, branch_id=10, discount=0):
    return schemas.SaleCreate(
        customer_id=None,
        branch_id=branch_id,
        payment_method="cash",
        discount=discount,
        items=[schemas.SaleItemCreate(product_id=1, quantity=quantity)],
    )


def test_sale_rejects_empty_items_before_database_mutation():
    db = FakeDB()
    sale = schemas.SaleCreate(
        customer_id=None,
        branch_id=10,
        payment_method="cash",
        items=[],
    )

    with pytest.raises(HTTPException) as exc:
        sales.create_sale(sale=sale, db=db, current_user=make_user())

    assert exc.value.status_code == 400
    assert exc.value.detail == "Sale must contain items"
    assert db.added == []
    assert db.committed is False
    assert db.rolled_back is False


def test_sale_rejects_cross_branch_cashier_before_transaction():
    db = FakeDB()

    with pytest.raises(HTTPException) as exc:
        sales.create_sale(
            sale=make_sale(branch_id=99),
            db=db,
            current_user=make_user(role="cashier", branch_id=10),
        )

    assert exc.value.status_code == 403
    assert exc.value.detail == "Not authorized for this branch"
    assert db.added == []
    assert db.committed is False


def test_insufficient_stock_rolls_back_and_preserves_inventory():
    product = SimpleNamespace(product_id=1, product_name="Rice", selling_price=2500)
    inventory = SimpleNamespace(product_id=1, branch_id=10, stock_quantity=2)
    db = FakeDB(product=product, inventory=inventory)

    with pytest.raises(HTTPException) as exc:
        sales.create_sale(
            sale=make_sale(quantity=3),
            db=db,
            current_user=make_user(),
        )

    assert exc.value.status_code == 400
    assert "Insufficient stock" in exc.value.detail
    assert inventory.stock_quantity == 2
    assert db.rolled_back is True
    assert db.committed is False


def test_successful_sale_decrements_stock_commits_and_applies_discount():
    product = SimpleNamespace(product_id=1, product_name="Rice", selling_price=2500)
    inventory = SimpleNamespace(product_id=1, branch_id=10, stock_quantity=5)
    db = FakeDB(product=product, inventory=inventory)

    result = sales.create_sale(
        sale=make_sale(quantity=2, discount=500),
        db=db,
        current_user=make_user(),
    )

    assert inventory.stock_quantity == 3
    assert db.committed is True
    assert db.rolled_back is False
    assert result["subtotal_before_discount"] == 5000.0
    assert result["discount"] == 500.0
    assert result["total_amount"] == 4500.0


def test_discount_is_capped_at_sale_total():
    product = SimpleNamespace(product_id=1, product_name="Rice", selling_price=1000)
    inventory = SimpleNamespace(product_id=1, branch_id=10, stock_quantity=5)
    db = FakeDB(product=product, inventory=inventory)

    result = sales.create_sale(
        sale=make_sale(quantity=1, discount=5000),
        db=db,
        current_user=make_user(),
    )

    assert result["subtotal_before_discount"] == 1000.0
    assert result["discount"] == 1000.0
    assert result["total_amount"] == 0.0
    assert inventory.stock_quantity == 4
    assert db.committed is True
