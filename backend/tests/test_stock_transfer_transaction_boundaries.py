import os
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, event
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models, schemas
from app.routers import inventory


def request(*items, from_branch, to_branch, key="transfer-1"):
    return schemas.StockTransferCreate(
        from_branch=from_branch,
        to_branch=to_branch,
        idempotency_key=key,
        items=list(items),
    )


def test_transfer_contract_rejects_invalid_requests():
    with pytest.raises(ValidationError):
        request({"product_id": 1, "quantity": 1}, from_branch=1, to_branch=1)
    with pytest.raises(ValidationError):
        request(
            {"product_id": 1, "quantity": 1},
            {"product_id": 1, "quantity": 2},
            from_branch=1, to_branch=2,
        )
    with pytest.raises(ValidationError):
        request({"product_id": 1, "quantity": 0}, from_branch=1, to_branch=2)
    with pytest.raises(ValidationError):
        request({"product_id": 1, "quantity": 1}, from_branch=1, to_branch=2, key="  ")


@pytest.fixture(scope="session")
def pg_engine():
    url = os.getenv("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL is required for stock-transfer database assurance")
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
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    yield session
    session.close()
    outer.rollback()
    connection.close()


def seed(db, *, destination_inventory=True):
    business = models.Business(name="Transfer Business")
    foreign_business = models.Business(name="Foreign Business")
    db.add_all([business, foreign_business]); db.flush()
    source_branch = models.Branch(name="Source", business_id=business.business_id)
    destination_branch = models.Branch(name="Destination", business_id=business.business_id)
    foreign_branch = models.Branch(name="Foreign", business_id=foreign_business.business_id)
    db.add_all([source_branch, destination_branch, foreign_branch]); db.flush()
    user = models.User(
        full_name="Manager", username=f"manager-{source_branch.branch_id}",
        password_hash="x", role="manager", branch_id=source_branch.branch_id,
        business_id=business.business_id,
    )
    db.add(user); db.flush()
    p1 = models.Product(
        business_id=business.business_id, product_name="Rice",
        barcode=f"rice-{source_branch.branch_id}", cost_price=500, selling_price=1000,
    )
    p2 = models.Product(
        business_id=business.business_id, product_name="Beans",
        barcode=f"beans-{source_branch.branch_id}", cost_price=250, selling_price=500,
    )
    foreign_product = models.Product(
        business_id=foreign_business.business_id, product_name="Foreign",
        barcode=f"foreign-{source_branch.branch_id}", cost_price=100, selling_price=200,
    )
    db.add_all([p1, p2, foreign_product]); db.flush()
    db.add_all([
        models.BranchInventory(
            branch_id=source_branch.branch_id, product_id=p1.product_id, stock_quantity=10
        ),
        models.BranchInventory(
            branch_id=source_branch.branch_id, product_id=p2.product_id, stock_quantity=7
        ),
    ])
    if destination_inventory:
        db.add_all([
            models.BranchInventory(
                branch_id=destination_branch.branch_id, product_id=p1.product_id, stock_quantity=2
            ),
            models.BranchInventory(
                branch_id=destination_branch.branch_id, product_id=p2.product_id, stock_quantity=3
            ),
        ])
    db.flush()
    actor = SimpleNamespace(
        user_id=user.user_id, role="manager",
        branch_id=source_branch.branch_id, business_id=business.business_id,
    )
    return SimpleNamespace(
        business=business, source=source_branch, destination=destination_branch,
        foreign=foreign_branch, p1=p1, p2=p2, foreign_product=foreign_product, actor=actor,
    )


def call(db, seeded, *items, key="transfer-1", source=None, destination=None):
    return inventory.transfer_stock(
        request(
            *items,
            from_branch=source or seeded.source.branch_id,
            to_branch=destination or seeded.destination.branch_id,
            key=key,
        ),
        db,
        seeded.actor,
    )


def stocks(db, branch_id):
    return {
        row.product_id: row.stock_quantity
        for row in db.query(models.BranchInventory).filter_by(branch_id=branch_id).all()
    }


def test_multi_item_transfer_is_exact_traceable_and_audited(db):
    seeded = seed(db)
    result = call(
        db, seeded,
        {"product_id": seeded.p1.product_id, "quantity": 4},
        {"product_id": seeded.p2.product_id, "quantity": 2},
    )
    assert result["status"] == "completed"
    assert stocks(db, seeded.source.branch_id) == {
        seeded.p1.product_id: 6, seeded.p2.product_id: 5,
    }
    assert stocks(db, seeded.destination.branch_id) == {
        seeded.p1.product_id: 6, seeded.p2.product_id: 5,
    }
    assert db.query(models.StockTransferItem).count() == 2
    movements = db.query(models.InventoryMovement).filter_by(
        stock_transfer_id=result["transfer_id"]
    ).all()
    assert sorted((row.movement_type, row.quantity) for row in movements) == [
        ("TRANSFER_IN", 2), ("TRANSFER_IN", 4),
        ("TRANSFER_OUT", -4), ("TRANSFER_OUT", -2),
    ]
    assert db.query(models.AuditLog).filter_by(action="INVENTORY_TRANSFER").count() == 1


def test_missing_destination_inventory_is_created_exactly(db):
    seeded = seed(db, destination_inventory=False)
    call(db, seeded, {"product_id": seeded.p1.product_id, "quantity": 3})
    assert stocks(db, seeded.source.branch_id)[seeded.p1.product_id] == 7
    assert stocks(db, seeded.destination.branch_id) == {seeded.p1.product_id: 3}


def test_scope_insufficient_stock_and_replay_are_blocked(db):
    seeded = seed(db)
    before_source = stocks(db, seeded.source.branch_id)
    with pytest.raises(HTTPException) as scope:
        call(
            db, seeded,
            {"product_id": seeded.p1.product_id, "quantity": 1},
            destination=seeded.foreign.branch_id,
        )
    assert scope.value.status_code == 403
    with pytest.raises(HTTPException) as source_scope:
        call(
            db, seeded,
            {"product_id": seeded.p1.product_id, "quantity": 1},
            source=seeded.destination.branch_id,
        )
    assert source_scope.value.status_code == 403
    with pytest.raises(HTTPException) as product_scope:
        call(
            db, seeded,
            {"product_id": seeded.foreign_product.product_id, "quantity": 1},
        )
    assert product_scope.value.status_code == 403
    with pytest.raises(HTTPException) as insufficient:
        call(db, seeded, {"product_id": seeded.p1.product_id, "quantity": 11})
    assert insufficient.value.status_code == 409
    call(db, seeded, {"product_id": seeded.p1.product_id, "quantity": 1}, key="once")
    after_once = stocks(db, seeded.source.branch_id)
    with pytest.raises(HTTPException) as replay:
        call(db, seeded, {"product_id": seeded.p1.product_id, "quantity": 1}, key="once")
    assert replay.value.status_code == 409
    assert stocks(db, seeded.source.branch_id) == after_once
    assert before_source[seeded.p2.product_id] == stocks(db, seeded.source.branch_id)[seeded.p2.product_id]


def test_later_line_failure_and_audit_failure_are_atomic(db):
    seeded = seed(db)
    before_source = stocks(db, seeded.source.branch_id)
    before_destination = stocks(db, seeded.destination.branch_id)
    with pytest.raises(HTTPException) as exc:
        call(
            db, seeded,
            {"product_id": seeded.p1.product_id, "quantity": 2},
            {"product_id": seeded.p2.product_id, "quantity": 99},
        )
    assert exc.value.status_code == 409
    assert stocks(db, seeded.source.branch_id) == before_source
    assert stocks(db, seeded.destination.branch_id) == before_destination
    assert db.query(models.StockTransfer).count() == 0

    def fail_audit(session, *_):
        if any(isinstance(row, models.AuditLog) for row in session.new):
            raise RuntimeError("audit write failed")

    event.listen(db, "before_flush", fail_audit)
    try:
        with pytest.raises(HTTPException) as audit:
            call(
                db, seeded,
                {"product_id": seeded.p1.product_id, "quantity": 2},
                key="audit-failure",
            )
        assert audit.value.status_code == 500
    finally:
        event.remove(db, "before_flush", fail_audit)
    assert stocks(db, seeded.source.branch_id) == before_source
    assert stocks(db, seeded.destination.branch_id) == before_destination
    assert db.query(models.StockTransfer).count() == 0


def test_database_constraints_reject_invalid_direct_evidence(db):
    seeded = seed(db)
    transfer = models.StockTransfer(
        business_id=seeded.business.business_id,
        from_branch=seeded.source.branch_id,
        to_branch=seeded.destination.branch_id,
        user_id=seeded.actor.user_id,
        idempotency_key="direct",
        status="completed",
    )
    db.add(transfer); db.flush()
    db.add(models.StockTransferItem(
        transfer_id=transfer.transfer_id,
        product_id=seeded.p1.product_id,
        quantity=2,
        source_before=10,
        source_after=9,
        destination_before=2,
        destination_after=4,
    ))
    with pytest.raises(IntegrityError):
        db.flush()
