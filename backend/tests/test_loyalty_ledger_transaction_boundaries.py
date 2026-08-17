import os
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, event, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models, schemas
from app.routers import loyalty, sales


@pytest.fixture(scope="session")
def pg_engine():
    url = os.getenv("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL is required for loyalty-ledger assurance")
    engine = create_engine(url)
    models.Base.metadata.drop_all(engine)
    models.Base.metadata.create_all(engine)
    with engine.begin() as connection:
        connection.execute(text(
            """
            CREATE UNIQUE INDEX uq_test_loyalty_sale_earn
              ON loyalty_transactions(sale_id) WHERE tx_type='earn';
            CREATE UNIQUE INDEX uq_test_loyalty_sale_redeem
              ON loyalty_transactions(sale_id) WHERE tx_type='redeem';
            """
        ))
    yield engine
    models.Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def db(pg_engine):
    connection = pg_engine.connect()
    outer = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    yield session
    session.close()
    outer.rollback()
    connection.close()


def seed(db, *, points=100):
    business = models.Business(
        name="Loyalty Business",
        loyalty_earn_rate=1,
        loyalty_redeem_rate=5,
    )
    foreign_business = models.Business(name="Foreign Loyalty Business")
    db.add_all([business, foreign_business]); db.flush()
    branch = models.Branch(name="Branch", business_id=business.business_id)
    foreign_branch = models.Branch(
        name="Foreign", business_id=foreign_business.business_id
    )
    db.add_all([branch, foreign_branch]); db.flush()
    user = models.User(
        full_name="Cashier", username=f"loyalty-{branch.branch_id}",
        password_hash="x", role="cashier", branch_id=branch.branch_id,
        business_id=business.business_id,
    )
    customer = models.Customer(
        business_id=business.business_id,
        full_name="Customer",
        phone=f"0800{branch.branch_id}",
    )
    foreign_customer = models.Customer(
        business_id=foreign_business.business_id,
        full_name="Foreign Customer",
        phone=f"0900{branch.branch_id}",
    )
    db.add_all([user, customer, foreign_customer]); db.flush()
    product = models.Product(
        business_id=business.business_id,
        product_name="Rice",
        barcode=f"loyalty-rice-{branch.branch_id}",
        cost_price=500,
        selling_price=1000,
    )
    db.add(product); db.flush()
    inventory = models.BranchInventory(
        branch_id=branch.branch_id,
        product_id=product.product_id,
        stock_quantity=10,
    )
    account = models.CustomerLoyalty(
        business_id=business.business_id,
        customer_id=customer.customer_id,
        points_balance=points,
        lifetime_earned=points,
        lifetime_redeemed=0,
        lifetime_expired=0,
    )
    db.add_all([inventory, account]); db.flush()
    db.commit()
    actor = SimpleNamespace(
        user_id=user.user_id, role="cashier",
        branch_id=branch.branch_id, business_id=business.business_id,
    )
    return SimpleNamespace(
        business=business, branch=branch, user=user, actor=actor,
        customer=customer, foreign_customer=foreign_customer,
        product=product, inventory=inventory, account=account,
    )


def create_sale(db, seeded, *, customer_id=None, points=0, discount=0):
    return sales.create_sale(
        schemas.SaleCreate(
            customer_id=customer_id or seeded.customer.customer_id,
            branch_id=seeded.branch.branch_id,
            payment_method="cash",
            items=[{"product_id": seeded.product.product_id, "quantity": 1}],
            discount=discount,
            loyalty_points_redeemed=points,
        ),
        db,
        seeded.actor,
    )


def test_sale_posts_exact_redemption_and_earning_atomically(db):
    seeded = seed(db)
    result = create_sale(db, seeded, points=20)
    assert result["subtotal_before_discount"] == 1000
    assert result["discount"] == 100
    assert result["total_amount"] == 900
    assert result["points_redeemed"] == 20
    assert result["points_earned"] == 9
    assert result["loyalty_balance"] == 89

    account = db.query(models.CustomerLoyalty).filter_by(
        loyalty_id=seeded.account.loyalty_id
    ).one()
    assert (
        account.points_balance,
        account.lifetime_earned,
        account.lifetime_redeemed,
        account.lifetime_expired,
    ) == (89, 109, 20, 0)
    txs = db.query(models.LoyaltyTransaction).filter_by(
        sale_id=result["sale_id"]
    ).order_by(models.LoyaltyTransaction.tx_id).all()
    assert [
        (tx.tx_type, tx.points, tx.balance_before, tx.balance_after)
        for tx in txs
    ] == [
        ("redeem", -20, 100, 80),
        ("earn", 9, 80, 89),
    ]
    assert db.query(models.AuditLog).filter_by(
        action="LOYALTY_SALE_POSTING"
    ).count() == 1


def test_foreign_customer_and_raw_discount_are_rejected_without_sale(db):
    seeded = seed(db)
    before_stock = seeded.inventory.stock_quantity
    with pytest.raises(HTTPException) as scope:
        create_sale(db, seeded, customer_id=seeded.foreign_customer.customer_id)
    assert scope.value.status_code == 403
    assert db.query(models.Sale).count() == 0
    assert db.query(models.BranchInventory).one().stock_quantity == before_stock
    with pytest.raises(HTTPException) as raw:
        create_sale(db, seeded, discount=50)
    assert raw.value.status_code == 400
    assert db.query(models.Sale).count() == 0


def test_insufficient_points_rolls_back_sale_inventory_and_ledger(db):
    seeded = seed(db, points=10)
    before_stock = seeded.inventory.stock_quantity
    with pytest.raises(HTTPException) as exc:
        create_sale(db, seeded, points=11)
    assert exc.value.status_code == 409
    assert db.query(models.Sale).count() == 0
    assert db.query(models.LoyaltyTransaction).count() == 0
    assert db.query(models.BranchInventory).one().stock_quantity == before_stock
    assert db.query(models.CustomerLoyalty).one().points_balance == 10


def test_mandatory_audit_failure_rolls_back_entire_sale(db):
    seeded = seed(db)
    before_stock = seeded.inventory.stock_quantity

    def fail_audit(session, *_):
        if any(isinstance(row, models.AuditLog) for row in session.new):
            raise RuntimeError("audit write failed")

    event.listen(db, "before_flush", fail_audit)
    try:
        with pytest.raises(HTTPException) as exc:
            create_sale(db, seeded, points=20)
        assert exc.value.status_code == 500
    finally:
        event.remove(db, "before_flush", fail_audit)
    assert db.query(models.Sale).count() == 0
    assert db.query(models.LoyaltyTransaction).count() == 0
    assert db.query(models.BranchInventory).one().stock_quantity == before_stock
    assert db.query(models.CustomerLoyalty).one().points_balance == 100


def test_compatibility_endpoints_are_idempotent_evidence_reads(db):
    seeded = seed(db)
    result = create_sale(db, seeded, points=20)
    redeemed = loyalty.redeem_points(
        loyalty.RedeemRequest(
            customer_id=seeded.customer.customer_id,
            points=20,
            sale_id=result["sale_id"],
        ),
        db,
        seeded.actor,
    )
    earned = loyalty.earn_points(
        seeded.customer.customer_id,
        900,
        result["sale_id"],
        db,
        seeded.actor,
    )
    assert redeemed["points_remaining"] == 80
    assert earned["points_balance"] == 89
    assert db.query(models.LoyaltyTransaction).count() == 2


def test_database_constraints_reject_invalid_snapshot_and_duplicate_sale(db):
    seeded = seed(db)
    result = create_sale(db, seeded)
    account = db.query(models.CustomerLoyalty).one()
    invalid = models.LoyaltyTransaction(
        loyalty_id=account.loyalty_id,
        business_id=seeded.business.business_id,
        customer_id=seeded.customer.customer_id,
        user_id=seeded.actor.user_id,
        tx_type="redeem",
        points=-5,
        sale_id=result["sale_id"],
        balance_before=109,
        balance_after=109,
        monetary_amount=25,
    )
    db.add(invalid)
    with pytest.raises(IntegrityError):
        db.flush()


def test_concurrent_redemptions_cannot_spend_the_same_balance(pg_engine):
    setup = Session(pg_engine)
    seeded = seed(setup, points=100)
    identifiers = {
        "business_id": seeded.business.business_id,
        "branch_id": seeded.branch.branch_id,
        "user_id": seeded.user.user_id,
        "customer_id": seeded.customer.customer_id,
        "product_id": seeded.product.product_id,
        "inventory_id": seeded.inventory.inventory_id,
        "loyalty_id": seeded.account.loyalty_id,
    }
    setup.close()
    gate = Barrier(2)

    def redeem_once():
        session = Session(pg_engine)
        actor = SimpleNamespace(
            user_id=identifiers["user_id"], role="cashier",
            branch_id=identifiers["branch_id"],
            business_id=identifiers["business_id"],
        )
        request = schemas.SaleCreate(
            customer_id=identifiers["customer_id"],
            branch_id=identifiers["branch_id"],
            payment_method="cash",
            items=[{"product_id": identifiers["product_id"], "quantity": 1}],
            loyalty_points_redeemed=80,
        )
        gate.wait()
        try:
            result = sales.create_sale(request, session, actor)
            return result["sale_id"]
        except HTTPException as exc:
            return exc.status_code
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=2) as executor:
        outcomes = list(executor.map(lambda _: redeem_once(), range(2)))

    assert outcomes.count(409) == 1
    assert len([outcome for outcome in outcomes if outcome != 409]) == 1
    verify = Session(pg_engine)
    try:
        account = verify.get(models.CustomerLoyalty, identifiers["loyalty_id"])
        inventory_row = verify.get(
            models.BranchInventory, identifiers["inventory_id"]
        )
        assert account.points_balance == 26
        assert inventory_row.stock_quantity == 9
        assert verify.query(models.Sale).count() == 1
        assert verify.query(models.LoyaltyTransaction).count() == 2
    finally:
        verify.close()
