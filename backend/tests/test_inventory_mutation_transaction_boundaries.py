import os
from io import BytesIO
from types import SimpleNamespace

import pytest
from fastapi import HTTPException, UploadFile
from pydantic import ValidationError
from sqlalchemy import create_engine, event
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models, schemas
from app.routers import inventory


def test_inventory_mutation_contracts_reject_invalid_values():
    with pytest.raises(ValidationError):
        schemas.InventoryRestockCreate(
            product_id=1, branch_id=1, quantity=0
        )
    with pytest.raises(ValidationError):
        schemas.InventoryAdjustmentRequest(
            product_id=1, quantity=0, reason="Count"
        )
    with pytest.raises(ValidationError):
        schemas.InventoryAdjustmentRequest(
            product_id=1, quantity=1, reason="   "
        )
    with pytest.raises(ValidationError):
        schemas.InventoryReorderLevelUpdate(
            product_id=1, branch_id=1, reorder_level=-1
        )


@pytest.fixture(scope="session")
def pg_engine():
    url = os.getenv("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL is required for inventory mutation assurance")
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


def seed(db):
    business = models.Business(name="Inventory Evidence Business")
    foreign_business = models.Business(name="Foreign Inventory Business")
    db.add_all([business, foreign_business])
    db.flush()

    branch = models.Branch(name="Branch", business_id=business.business_id)
    other_branch = models.Branch(name="Other", business_id=business.business_id)
    foreign_branch = models.Branch(
        name="Foreign", business_id=foreign_business.business_id
    )
    db.add_all([branch, other_branch, foreign_branch])
    db.flush()

    user = models.User(
        full_name="Manager",
        username=f"inventory-manager-{branch.branch_id}",
        password_hash="x",
        role="manager",
        branch_id=branch.branch_id,
        business_id=business.business_id,
    )
    p1 = models.Product(
        business_id=business.business_id,
        product_name="Rice",
        barcode=f"inventory-rice-{branch.branch_id}",
        cost_price=500,
        selling_price=1000,
    )
    p2 = models.Product(
        business_id=business.business_id,
        product_name="Beans",
        barcode=f"inventory-beans-{branch.branch_id}",
        cost_price=250,
        selling_price=500,
    )
    foreign_product = models.Product(
        business_id=foreign_business.business_id,
        product_name="Foreign",
        barcode=f"inventory-foreign-{branch.branch_id}",
        cost_price=100,
        selling_price=200,
    )
    db.add_all([user, p1, p2, foreign_product])
    db.flush()

    inv1 = models.BranchInventory(
        branch_id=branch.branch_id,
        product_id=p1.product_id,
        stock_quantity=5,
    )
    inv2 = models.BranchInventory(
        branch_id=branch.branch_id,
        product_id=p2.product_id,
        stock_quantity=3,
    )
    other_inv = models.BranchInventory(
        branch_id=other_branch.branch_id,
        product_id=p1.product_id,
        stock_quantity=8,
    )
    db.add_all([inv1, inv2, other_inv])
    db.flush()

    actor = SimpleNamespace(
        user_id=user.user_id,
        role="manager",
        branch_id=branch.branch_id,
        business_id=business.business_id,
    )
    return SimpleNamespace(
        business=business,
        branch=branch,
        other_branch=other_branch,
        foreign_branch=foreign_branch,
        actor=actor,
        p1=p1,
        p2=p2,
        foreign_product=foreign_product,
        inv1=inv1,
        inv2=inv2,
        other_inv=other_inv,
    )


def adjust(db, seeded, quantity, reason="Cycle count", branch_id=None):
    return inventory.adjust_stock(
        seeded.p1.product_id,
        quantity,
        reason,
        branch_id,
        db,
        seeded.actor,
    )


def upload(csv_text):
    return UploadFile(
        filename="restock.csv",
        file=BytesIO(csv_text.encode("utf-8")),
    )


def test_manager_cannot_mutate_another_branch_or_foreign_product(db):
    seeded = seed(db)
    with pytest.raises(HTTPException) as exc:
        adjust(db, seeded, 1, branch_id=seeded.other_branch.branch_id)
    assert exc.value.status_code == 403
    assert seeded.other_inv.stock_quantity == 8

    request = schemas.InventoryRestockCreate(
        product_id=seeded.foreign_product.product_id,
        branch_id=seeded.branch.branch_id,
        quantity=1,
    )
    with pytest.raises(HTTPException) as restock_exc:
        inventory.restock_product(request, db, seeded.actor)
    assert restock_exc.value.status_code == 403

    threshold = schemas.InventoryReorderLevelUpdate(
        product_id=seeded.p1.product_id,
        branch_id=seeded.other_branch.branch_id,
        reorder_level=2,
    )
    with pytest.raises(HTTPException) as threshold_exc:
        inventory.update_reorder_level(threshold, db, seeded.actor)
    assert threshold_exc.value.status_code == 403


def test_adjustment_records_exact_stock_movement_ledger_and_audit(db):
    seeded = seed(db)
    result = adjust(db, seeded, 2)
    assert result["new_stock"] == 7

    db.refresh(seeded.inv1)
    assert seeded.inv1.stock_quantity == 7
    adjustment = db.query(models.StockAdjustment).one()
    assert adjustment.branch_id == seeded.branch.branch_id
    assert adjustment.user_id == seeded.actor.user_id
    assert adjustment.before_quantity == 5
    assert adjustment.quantity == 2
    assert adjustment.after_quantity == 7
    assert adjustment.reason == "Cycle count"

    movement = db.query(models.InventoryMovement).filter_by(
        movement_type="ADJUSTMENT"
    ).one()
    assert movement.quantity == 2
    assert movement.reference_id == adjustment.adjustment_id
    assert db.query(models.AuditLog).filter_by(
        action="INVENTORY_ADJUSTMENT"
    ).count() == 1


def test_negative_adjustment_and_audit_failure_are_atomic(db):
    seeded = seed(db)
    before = seeded.inv1.stock_quantity

    with pytest.raises(HTTPException) as negative_exc:
        adjust(db, seeded, -(before + 1))
    assert negative_exc.value.status_code == 409
    assert db.query(models.BranchInventory).filter_by(
        inventory_id=seeded.inv1.inventory_id
    ).one().stock_quantity == before
    assert db.query(models.StockAdjustment).count() == 0

    def fail_audit(session, *_):
        if any(isinstance(row, models.AuditLog) for row in session.new):
            raise RuntimeError("audit write failed")

    event.listen(db, "before_flush", fail_audit)
    try:
        with pytest.raises(HTTPException) as audit_exc:
            adjust(db, seeded, 1)
        assert audit_exc.value.status_code == 500
    finally:
        event.remove(db, "before_flush", fail_audit)

    assert db.query(models.BranchInventory).filter_by(
        inventory_id=seeded.inv1.inventory_id
    ).one().stock_quantity == before
    assert db.query(models.StockAdjustment).count() == 0
    assert db.query(models.InventoryMovement).filter_by(
        movement_type="ADJUSTMENT"
    ).count() == 0


def test_direct_restock_records_exact_stock_batch_movement_and_audit(db):
    seeded = seed(db)
    request = schemas.InventoryRestockCreate(
        product_id=seeded.p1.product_id,
        branch_id=seeded.branch.branch_id,
        quantity=4,
        notes="Manual delivery",
    )
    result = inventory.restock_product(request, db, seeded.actor)
    assert result["new_stock"] == 9

    batch = db.query(models.InventoryBatch).one()
    movement = db.query(models.InventoryMovement).filter_by(
        movement_type="RESTOCK"
    ).one()
    assert batch.quantity == 4
    assert movement.quantity == 4
    assert movement.reference_id == batch.batch_id
    assert db.query(models.AuditLog).filter_by(
        action="INVENTORY_RESTOCK"
    ).count() == 1


def test_bulk_restock_rejects_duplicates_and_fractional_rows(db):
    seeded = seed(db)
    csv_text = (
        "barcode,quantity,notes\n"
        f"{seeded.p1.barcode},2,Valid\n"
        f"{seeded.p2.barcode},1,Duplicate one\n"
        f"{seeded.p2.barcode},1,Duplicate two\n"
        f"{seeded.foreign_product.barcode},1.5,Fractional\n"
    )
    result = inventory.bulk_restock(
        upload(csv_text),
        seeded.branch.branch_id,
        db,
        seeded.actor,
    )
    assert result["restocked"] == 1
    assert result["skipped"] == 3
    assert len(result["errors"]) == 3

    stocks = {
        row.product_id: row.stock_quantity
        for row in db.query(models.BranchInventory).filter(
            models.BranchInventory.branch_id == seeded.branch.branch_id
        ).all()
    }
    assert stocks == {seeded.p1.product_id: 7, seeded.p2.product_id: 3}
    assert db.query(models.InventoryBatch).count() == 1
    assert db.query(models.InventoryMovement).filter_by(
        movement_type="RESTOCK"
    ).count() == 1
    assert db.query(models.AuditLog).filter_by(
        action="INVENTORY_BULK_RESTOCK"
    ).count() == 1


def test_bulk_restock_audit_failure_rolls_back_every_accepted_row(db):
    seeded = seed(db)
    before = {seeded.p1.product_id: 5, seeded.p2.product_id: 3}
    csv_text = (
        "barcode,quantity\n"
        f"{seeded.p1.barcode},2\n"
        f"{seeded.p2.barcode},4\n"
    )

    def fail_audit(session, *_):
        if any(isinstance(row, models.AuditLog) for row in session.new):
            raise RuntimeError("audit write failed")

    event.listen(db, "before_flush", fail_audit)
    try:
        with pytest.raises(HTTPException) as exc:
            inventory.bulk_restock(
                upload(csv_text),
                seeded.branch.branch_id,
                db,
                seeded.actor,
            )
        assert exc.value.status_code == 500
    finally:
        event.remove(db, "before_flush", fail_audit)

    stocks = {
        row.product_id: row.stock_quantity
        for row in db.query(models.BranchInventory).filter(
            models.BranchInventory.branch_id == seeded.branch.branch_id
        ).all()
    }
    assert stocks == before
    assert db.query(models.InventoryBatch).count() == 0
    assert db.query(models.InventoryMovement).filter_by(
        movement_type="RESTOCK"
    ).count() == 0


def test_reorder_update_is_scoped_audited_and_exact(db):
    seeded = seed(db)
    request = schemas.InventoryReorderLevelUpdate(
        product_id=seeded.p1.product_id,
        branch_id=seeded.branch.branch_id,
        reorder_level=2,
        expiry_alert_days=30,
    )
    result = inventory.update_reorder_level(request, db, seeded.actor)
    assert result["reorder_level"] == 2
    assert result["expiry_alert_days"] == 30
    assert db.query(models.AuditLog).filter_by(
        action="INVENTORY_THRESHOLD_UPDATE"
    ).count() == 1


def test_database_rejects_direct_negative_inventory(db):
    seeded = seed(db)
    seeded.inv1.stock_quantity = -1
    with pytest.raises(IntegrityError):
        db.flush()


def test_database_rejects_incomplete_adjustment_evidence(db):
    seeded = seed(db)
    db.add(models.StockAdjustment(
        product_id=seeded.p1.product_id,
        quantity=1,
        reason="Direct write",
    ))
    with pytest.raises(IntegrityError):
        db.flush()
