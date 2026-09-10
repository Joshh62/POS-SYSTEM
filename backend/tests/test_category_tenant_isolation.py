from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app import models, schemas
from app.routers import category


def actor(role="admin", business_id=41):
    return SimpleNamespace(role=role, business_id=business_id, user_id=7)


def test_category_model_uses_tenant_scoped_name_uniqueness():
    constraints = {
        item.name: tuple(column.name for column in item.columns)
        for item in models.Category.__table__.constraints
        if getattr(item, "name", None)
    }
    assert constraints["uq_categories_business_name"] == (
        "business_id",
        "category_name",
    )


def test_create_category_assigns_current_business():
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None

    result = category.create_category(
        schemas.CategoryCreate(category_name="  Groceries  "),
        business_id=None,
        db=db,
        user=actor(),
    )

    assert result.business_id == 41
    assert result.category_name == "Groceries"
    assert db.add.call_args.args[0] is result


def test_duplicate_category_check_is_scoped_to_current_business():
    db = MagicMock()
    existing = SimpleNamespace(category_id=1)
    filtered = db.query.return_value.filter.return_value
    filtered.first.return_value = existing

    with pytest.raises(HTTPException) as exc:
        category.create_category(
            schemas.CategoryCreate(category_name="Groceries"),
            business_id=None,
            db=db,
            user=actor(business_id=73),
        )

    assert exc.value.status_code == 400
    criteria = filtered.first.call_args
    assert criteria is not None
    filter_expressions = db.query.return_value.filter.call_args.args
    assert any(
        "categories.business_id" in str(expression)
        for expression in filter_expressions
    )


def test_superadmin_must_select_business_scope():
    with pytest.raises(HTTPException) as exc:
        category.get_categories(
            business_id=None,
            db=MagicMock(),
            user=actor(role="superadmin", business_id=None),
        )
    assert exc.value.status_code == 400


def test_product_and_customer_identifiers_are_unique_per_business():
    product_constraints = {
        item.name: tuple(column.name for column in item.columns)
        for item in models.Product.__table__.constraints
        if getattr(item, "name", None)
    }
    customer_constraints = {
        item.name: tuple(column.name for column in item.columns)
        for item in models.Customer.__table__.constraints
        if getattr(item, "name", None)
    }
    assert product_constraints["uq_products_business_barcode"] == (
        "business_id",
        "barcode",
    )
    assert customer_constraints["uq_customers_business_phone"] == (
        "business_id",
        "phone",
    )
