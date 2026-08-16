import os
from decimal import Decimal
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, event, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models, schemas
from app.routers import sales


def refund_request(*items, reason="Customer return"):
    return schemas.RefundCreate(reason=reason, items=list(items))


def test_refund_contract_rejects_invalid_quantities_duplicates_and_blank_reason():
    for quantity in (0, -1):
        with pytest.raises(ValidationError):
            refund_request({"sale_item_id": 1, "quantity": quantity})
    with pytest.raises(ValidationError):
        refund_request(
            {"sale_item_id": 1, "quantity": 1},
            {"sale_item_id": 1, "quantity": 1},
        )
    with pytest.raises(ValidationError):
        refund_request({"sale_item_id": 1, "quantity": 1}, reason="   ")


@pytest.fixture(scope="session")
def pg_engine():
    url = os.getenv("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL is required for refund database assurance")
    engine = create_engine(url)
    models.Base.metadata.drop_all(engine)
    models.Base.metadata.create_all(engine)
    ddl = """
    CREATE OR REPLACE FUNCTION enforce_refund_item_quantity() RETURNS trigger AS $$
    DECLARE sold integer; target_sale integer; item_sale integer; prior bigint;
    BEGIN
      SELECT sale_id INTO target_sale FROM refunds WHERE refund_id=NEW.refund_id;
      SELECT sale_id,quantity INTO item_sale,sold FROM sale_items WHERE sale_item_id=NEW.sale_item_id;
      IF target_sale IS NULL OR item_sale IS NULL OR target_sale<>item_sale THEN
        RAISE EXCEPTION 'refund item does not belong to refund sale' USING ERRCODE='23514';
      END IF;
      PERFORM 1 FROM sales WHERE sale_id=target_sale FOR UPDATE;
      SELECT COALESCE(SUM(ri.quantity),0) INTO prior FROM refund_items ri
        JOIN refunds r ON r.refund_id=ri.refund_id
        WHERE r.sale_id=target_sale AND ri.sale_item_id=NEW.sale_item_id;
      IF NEW.quantity<=0 OR prior+NEW.quantity>sold THEN
        RAISE EXCEPTION 'cumulative refund quantity exceeds sold quantity' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END; $$ LANGUAGE plpgsql;
    CREATE TRIGGER trg_enforce_refund_item_quantity BEFORE INSERT ON refund_items
      FOR EACH ROW EXECUTE FUNCTION enforce_refund_item_quantity();
    """
    with engine.begin() as connection:
        connection.execute(text(ddl))
    yield engine
    with engine.begin() as connection:
        connection.execute(text(
            "DROP FUNCTION IF EXISTS enforce_refund_item_quantity() CASCADE"
        ))
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


def seed(db, *, two_items=False, missing_second=False, status="completed"):
    business = models.Business(name="Evidence Business")
    foreign_business = models.Business(name="Foreign Business")
    db.add_all([business, foreign_business])
    db.flush()

    branch = models.Branch(
        name="Branch",
        business_id=business.business_id,
    )
    foreign = models.Branch(
        name="Foreign",
        business_id=foreign_business.business_id,
    )
    db.add_all([branch, foreign])
    db.flush()
    user = models.User(full_name="Manager", username=f"m-{branch.branch_id}",
        password_hash="x", role="manager", branch_id=branch.branch_id,
        business_id=business.business_id)
    db.add(user); db.flush()
    p1 = models.Product(business_id=business.business_id, product_name="Rice",
        barcode=f"r-{branch.branch_id}", cost_price=500, selling_price=1000)
    db.add(p1); db.flush()
    sale = models.Sale(user_id=user.user_id, branch_id=branch.branch_id,
        payment_method="cash", total_amount=4500 if two_items else 4000,
        discount=500 if two_items else 0, status=status)
    db.add(sale); db.flush()
    i1 = models.SaleItem(sale_id=sale.sale_id, product_id=p1.product_id,
        quantity=4, unit_price=1000, subtotal=4000)
    db.add(i1)
    db.add(models.BranchInventory(branch_id=branch.branch_id,
        product_id=p1.product_id, stock_quantity=6))
    i2 = None
    if two_items:
        p2 = models.Product(business_id=business.business_id, product_name="Beans",
            barcode=f"b-{branch.branch_id}", cost_price=250, selling_price=500)
        db.add(p2); db.flush()
        i2 = models.SaleItem(sale_id=sale.sale_id, product_id=p2.product_id,
            quantity=2, unit_price=500, subtotal=1000)
        db.add(i2)
        if not missing_second:
            db.add(models.BranchInventory(branch_id=branch.branch_id,
                product_id=p2.product_id, stock_quantity=3))
    db.flush()
    actor = SimpleNamespace(
        user_id=user.user_id,
        role="manager",
        branch_id=branch.branch_id,
        business_id=business.business_id,
    )

    # Preserve seed data when refund_sale() rolls back its own transaction.
    db.commit()

    return sale, i1, i2, actor, foreign


def call(db, actor, sale, *items):
    return sales.refund_sale(sale.sale_id, refund_request(*items), db, actor)


def test_partial_then_final_refund_restores_exact_stock_and_evidence(db):
    sale, i1, i2, actor, _ = seed(db, two_items=True)
    first = call(db, actor, sale, {"sale_item_id": i1.sale_item_id, "quantity": 2})
    assert first["sale_status"] == "partially_refunded"
    assert first["amount"] == 1800.0
    final = call(db, actor, sale,
        {"sale_item_id": i1.sale_item_id, "quantity": 2},
        {"sale_item_id": i2.sale_item_id, "quantity": 2})
    assert final["sale_status"] == "refunded"
    assert final["amount"] == 2700.0
    stock = {x.product_id: x.stock_quantity for x in db.query(models.BranchInventory).all()}
    assert stock == {i1.product_id: 10, i2.product_id: 5}
    assert db.query(models.RefundItem).count() == 3
    assert db.query(models.InventoryMovement).filter_by(movement_type="REFUND").count() == 3
    assert db.query(models.AuditLog).filter_by(action="REFUND").count() == 2
    assert sum(x.amount for x in db.query(models.Refund).all()) == Decimal("4500.00")


def test_cumulative_over_refund_and_status_disclosure_are_blocked(db):
    sale, item, _, actor, foreign = seed(db)
    call(db, actor, sale, {"sale_item_id": item.sale_item_id, "quantity": 3})
    before = db.query(models.BranchInventory).one().stock_quantity
    with pytest.raises(HTTPException) as exc:
        call(db, actor, sale, {"sale_item_id": item.sale_item_id, "quantity": 2})
    assert exc.value.status_code == 409
    assert db.query(models.BranchInventory).one().stock_quantity == before
    sale.status = "refunded"; db.commit()
    actor.branch_id = foreign.branch_id
    with pytest.raises(HTTPException) as scope_exc:
        call(db, actor, sale, {"sale_item_id": item.sale_item_id, "quantity": 1})
    assert scope_exc.value.status_code == 403


def test_later_missing_inventory_and_mandatory_audit_failure_are_atomic(db):
    sale, i1, i2, actor, _ = seed(db, two_items=True, missing_second=True)
    before = db.query(models.BranchInventory).one().stock_quantity
    with pytest.raises(HTTPException) as exc:
        call(db, actor, sale,
            {"sale_item_id": i1.sale_item_id, "quantity": 1},
            {"sale_item_id": i2.sale_item_id, "quantity": 1})
    assert exc.value.status_code == 409
    assert db.query(models.BranchInventory).one().stock_quantity == before
    assert db.query(models.Refund).count() == 0
    def fail_audit(session, *_):
        if any(isinstance(x, models.AuditLog) for x in session.new):
            raise RuntimeError("audit write failed")
    event.listen(db, "before_flush", fail_audit)
    try:
        with pytest.raises(HTTPException) as audit_exc:
            call(db, actor, sale, {"sale_item_id": i1.sale_item_id, "quantity": 1})
        assert audit_exc.value.status_code == 500
    finally:
        event.remove(db, "before_flush", fail_audit)
    assert db.query(models.BranchInventory).one().stock_quantity == before
    assert db.query(models.Refund).count() == 0


def test_database_trigger_rejects_direct_over_refund(db):
    sale, item, _, actor, _ = seed(db)
    refund = models.Refund(sale_id=sale.sale_id, user_id=actor.user_id,
        branch_id=sale.branch_id, reason="Direct", amount=4000)
    db.add(refund); db.flush()
    db.add(models.RefundItem(refund_id=refund.refund_id,
        sale_item_id=item.sale_item_id, product_id=item.product_id,
        quantity=5, unit_price=1000, amount=4000))
    with pytest.raises(IntegrityError):
        db.flush()
