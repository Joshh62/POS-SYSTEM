from datetime import datetime, timedelta
import os
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import models
from app.routers import businesses


@pytest.fixture(scope="session")
def pg_engine():
    url = os.getenv("TEST_DATABASE_URL")
    if not url:
        pytest.skip(
            "TEST_DATABASE_URL is required for tenant-activity assurance"
        )
    engine = create_engine(url)
    models.Base.metadata.drop_all(engine)
    models.Base.metadata.create_all(engine)
    yield engine
    models.Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def db(pg_engine):
    connection = pg_engine.connect()
    outer = connection.begin()
    session = Session(
        bind=connection,
        join_transaction_mode="create_savepoint",
    )
    yield session
    session.close()
    outer.rollback()
    connection.close()


def seed(db):
    now = datetime.utcnow()
    active_business = models.Business(
        name="Active Tenant",
        plan="starter",
    )
    quiet_business = models.Business(
        name="Quiet Tenant",
        plan="business",
        created_at=now - timedelta(days=10),
    )
    db.add_all([active_business, quiet_business])
    db.flush()

    active_branch = models.Branch(
        name="Active Branch",
        business_id=active_business.business_id,
    )
    quiet_branch = models.Branch(
        name="Quiet Branch",
        business_id=quiet_business.business_id,
    )
    db.add_all([active_branch, quiet_branch])
    db.flush()

    active_user = models.User(
        full_name="Active Manager",
        username=f"activity-{active_business.business_id}",
        password_hash="x",
        role="manager",
        branch_id=active_branch.branch_id,
        business_id=active_business.business_id,
    )
    quiet_user = models.User(
        full_name="Quiet Manager",
        username=f"quiet-{quiet_business.business_id}",
        password_hash="x",
        role="manager",
        branch_id=quiet_branch.branch_id,
        business_id=quiet_business.business_id,
    )
    db.add_all([active_user, quiet_user])
    db.flush()

    db.add_all([
        models.Sale(
            user_id=active_user.user_id,
            branch_id=active_branch.branch_id,
            payment_method="cash",
            total_amount=100,
            status="completed",
            sale_date=now - timedelta(days=1),
        ),
        models.Sale(
            user_id=active_user.user_id,
            branch_id=active_branch.branch_id,
            payment_method="card",
            total_amount=200,
            status="completed",
            sale_date=now - timedelta(days=10),
        ),
        models.Sale(
            user_id=active_user.user_id,
            branch_id=active_branch.branch_id,
            payment_method="transfer",
            total_amount=300,
            status="completed",
            sale_date=now - timedelta(days=40),
        ),
        models.Sale(
            user_id=quiet_user.user_id,
            branch_id=quiet_branch.branch_id,
            payment_method="cash",
            total_amount=999,
            status="voided",
            sale_date=now - timedelta(days=1),
        ),
    ])
    db.flush()
    return active_business, quiet_business


def actor(role):
    return SimpleNamespace(
        user_id=999,
        role=role,
        branch_id=None,
        business_id=None,
    )


def test_only_superadmin_can_read_cross_tenant_activity(db):
    seed(db)

    with pytest.raises(HTTPException) as exc:
        businesses.list_businesses(db, actor("admin"))

    assert exc.value.status_code == 403
    assert exc.value.detail == "Superadmin only"


def test_activity_is_aggregate_exact_and_tenant_isolated(db):
    active_business, quiet_business = seed(db)

    result = businesses.list_businesses(db, actor("superadmin"))
    by_id = {row["business_id"]: row for row in result}

    active = by_id[active_business.business_id]["activity"]
    assert active["status"] == "active_7d"
    assert active["total_sales"] == 3
    assert active["sales_last_7_days"] == 1
    assert active["sales_last_30_days"] == 2
    assert active["last_sale_at"] is not None

    quiet = by_id[quiet_business.business_id]["activity"]
    assert quiet == {
        "status": "no_sales",
        "total_sales": 0,
        "sales_last_7_days": 0,
        "sales_last_30_days": 0,
        "last_sale_at": None,
    }


def test_adoption_lifecycle_and_follow_up_are_bounded_and_exact(db):
    active_business, quiet_business = seed(db)

    result = businesses.list_businesses(db, actor("superadmin"))
    by_id = {row["business_id"]: row for row in result}

    active = by_id[active_business.business_id]["adoption"]
    assert active["stage"] == "first_value"
    assert active["setup_ready"] is True
    assert active["first_value_at"] is not None
    assert active["commercial_follow_up"] == "none"

    quiet = by_id[quiet_business.business_id]["adoption"]
    assert quiet["stage"] == "setup_ready"
    assert quiet["setup_ready"] is True
    assert quiet["tenant_age_days"] >= 7
    assert quiet["first_value_at"] is None
    assert quiet["commercial_follow_up"] == "onboarding_follow_up"


def test_activity_response_excludes_transaction_and_customer_detail(db):
    seed(db)

    result = businesses.list_businesses(db, actor("superadmin"))
    forbidden = {
        "total_amount",
        "revenue",
        "customer_id",
        "customer_name",
        "product_id",
        "product_name",
        "cashier",
        "payment_method",
        "sale_id",
        "items",
    }

    for business in result:
        assert forbidden.isdisjoint(business)
        assert set(business["activity"]) == {
            "status",
            "total_sales",
            "sales_last_7_days",
            "sales_last_30_days",
            "last_sale_at",
        }
        assert set(business["adoption"]) == {
            "stage",
            "registered_at",
            "tenant_age_days",
            "setup_ready",
            "first_value_at",
            "commercial_follow_up",
        }
        assert forbidden.isdisjoint(business["activity"])
        assert forbidden.isdisjoint(business["adoption"])
