import os
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, event, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models, schemas
from app.routers import purchases


def receipt_request(*items, notes="Delivery"):
    return schemas.PurchaseReceiptCreate(items=list(items), notes=notes)


def test_purchase_contract_rejects_empty_invalid_and_duplicate_items():
    with pytest.raises(ValidationError):
        schemas.PurchaseOrderCreate(supplier_id=1, branch_id=1, items=[])
    for quantity in (0, -1):
        with pytest.raises(ValidationError):
            schemas.PurchaseOrderItemCreate(product_id=1, quantity=quantity, unit_cost=10)
    with pytest.raises(ValidationError):
        schemas.PurchaseOrderItemCreate(product_id=1, quantity=1, unit_cost=0)
    with pytest.raises(ValidationError):
        schemas.PurchaseOrderCreate(
            supplier_id=1,
            branch_id=1,
            items=[
                {"product_id": 1, "quantity": 1, "unit_cost": 10},
                {"product_id": 1, "quantity": 1, "unit_cost": 10},
            ],
        )
    with pytest.raises(ValidationError):
        receipt_request()
    with pytest.raises(ValidationError):
        receipt_request(
            {"po_item_id": 1, "quantity": 1},
            {"po_item_id": 1, "quantity": 1},
        )


@pytest.fixture(scope="session")
def pg_engine():
    url = os.getenv("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL is required for purchase receipt assurance")
    engine = create_engine(url)
    models.Base.metadata.drop_all(engine)
    models.Base.metadata.create_all(engine)
    ddl = """
    CREATE OR REPLACE FUNCTION enforce_purchase_receipt_quantity()
    RETURNS trigger AS $$
    DECLARE
      target_po integer; item_po integer; item_product integer; ordered integer;
      prior bigint; receipt_business integer; receipt_branch integer;
      po_business integer; po_branch integer;
    BEGIN
      SELECT po_id,business_id,branch_id
        INTO target_po,receipt_business,receipt_branch
        FROM purchase_receipts WHERE receipt_id=NEW.receipt_id;
      SELECT po_id,product_id,quantity
        INTO item_po,item_product,ordered
        FROM purchase_order_items WHERE po_item_id=NEW.po_item_id;
      IF target_po IS NULL OR item_po IS NULL OR target_po<>item_po
         OR NEW.product_id<>item_product THEN
        RAISE EXCEPTION 'receipt item does not belong to purchase order'
          USING ERRCODE='23514';
      END IF;
      SELECT business_id,branch_id INTO po_business,po_branch
        FROM purchase_orders WHERE po_id=target_po FOR UPDATE;
      IF receipt_business<>po_business OR receipt_branch<>po_branch THEN
        RAISE EXCEPTION 'receipt scope does not match purchase order'
          USING ERRCODE='23514';
      END IF;
      SELECT COALESCE(SUM(pri.quantity),0) INTO prior
        FROM purchase_receipt_items pri
        JOIN purchase_receipts pr ON pr.receipt_id=pri.receipt_id
        WHERE pr.po_id=target_po AND pri.po_item_id=NEW.po_item_id
          AND pri.receipt_item_id<>COALESCE(NEW.receipt_item_id,0);
      IF NEW.quantity<=0 OR prior+NEW.quantity>ordered THEN
        RAISE EXCEPTION 'cumulative receipt quantity exceeds ordered quantity'
          USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END; $$ LANGUAGE plpgsql;
    CREATE TRIGGER trg_enforce_purchase_receipt_quantity
      BEFORE INSERT OR UPDATE ON purchase_receipt_items
      FOR EACH ROW EXECUTE FUNCTION enforce_purchase_receipt_quantity();
    """
    with engine.begin() as connection:
        connection.execute(text(ddl))
    yield engine
    with engine.begin() as connection:
        connection.execute(text(
            "DROP FUNCTION IF EXISTS enforce_purchase_receipt_quantity() CASCADE"
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


def seed(db, *, two_items=False):
    business = models.Business(name="Evidence Business")
    foreign_business = models.Business(name="Foreign Business")
    db.add_all([business, foreign_business])
    db.flush()

    branch = models.Branch(name="Branch", business_id=business.business_id)
    other_branch = models.Branch(name="Other", business_id=business.business_id)
    foreign_branch = models.Branch(name="Foreign", business_id=foreign_business.business_id)
    db.add_all([branch, other_branch, foreign_branch])
    db.flush()

    user = models.User(
        full_name="Manager", username=f"po-manager-{branch.branch_id}",
        password_hash="x", role="manager", branch_id=branch.branch_id,
        business_id=business.business_id,
    )
    supplier = models.Supplier(
        business_id=business.business_id, supplier_name="Supplier"
    )
    foreign_supplier = models.Supplier(
        business_id=foreign_business.business_id, supplier_name="Foreign Supplier"
    )
    db.add_all([user, supplier, foreign_supplier])
    db.flush()

    p1 = models.Product(
        business_id=business.business_id, product_name="Rice",
        barcode=f"po-rice-{branch.branch_id}", cost_price=500, selling_price=1000,
    )
    db.add(p1)
    db.flush()

    po = models.PurchaseOrder(
        business_id=business.business_id, supplier_id=supplier.supplier_id,
        branch_id=branch.branch_id, status="pending",
    )
    db.add(po)
    db.flush()
    i1 = models.PurchaseOrderItem(
        po_id=po.po_id, product_id=p1.product_id, quantity=4, unit_cost=500,
    )
    db.add(i1)
    db.add(models.BranchInventory(
        branch_id=branch.branch_id, product_id=p1.product_id, stock_quantity=5,
    ))

    i2 = None
    p2 = None
    if two_items:
        p2 = models.Product(
            business_id=business.business_id, product_name="Beans",
            barcode=f"po-beans-{branch.branch_id}", cost_price=250, selling_price=500,
        )
        db.add(p2)
        db.flush()
        i2 = models.PurchaseOrderItem(
            po_id=po.po_id, product_id=p2.product_id, quantity=2, unit_cost=250,
        )
        db.add(i2)

    db.commit()
    actor = SimpleNamespace(
        user_id=user.user_id, role="manager", branch_id=branch.branch_id,
        business_id=business.business_id,
    )
    return SimpleNamespace(
        business=business, foreign_business=foreign_business, branch=branch,
        other_branch=other_branch, foreign_branch=foreign_branch, actor=actor,
        supplier=supplier, foreign_supplier=foreign_supplier,
        po=po, i1=i1, i2=i2, p1=p1, p2=p2,
    )


def receive(db, seeded, *items):
    return purchases.receive_purchase_order(
        seeded.po.po_id, receipt_request(*items), db, seeded.actor,
    )


def test_manager_cannot_create_or_read_outside_authorized_scope(db):
    seeded = seed(db)
    request = schemas.PurchaseOrderCreate(
        supplier_id=seeded.foreign_supplier.supplier_id,
        branch_id=seeded.branch.branch_id,
        items=[{"product_id": seeded.p1.product_id, "quantity": 1, "unit_cost": 500}],
    )
    before = db.query(models.PurchaseOrder).count()
    with pytest.raises(HTTPException) as create_exc:
        purchases.create_purchase_order(request, db, seeded.actor)
    assert create_exc.value.status_code == 403
    assert db.query(models.PurchaseOrder).count() == before

    seeded.actor.branch_id = seeded.foreign_branch.branch_id
    seeded.actor.business_id = seeded.foreign_business.business_id
    with pytest.raises(HTTPException) as receive_exc:
        receive(db, seeded, {"po_item_id": seeded.i1.po_item_id, "quantity": 1})
    assert receive_exc.value.status_code == 403
    assert seeded.po.status == "pending"


def test_create_purchase_order_is_atomic_when_audit_write_fails(db):
    seeded = seed(db)
    before = db.query(models.PurchaseOrder).count()

    def fail_audit(session, *_):
        if any(isinstance(row, models.AuditLog) for row in session.new):
            raise RuntimeError("audit write failed")

    event.listen(db, "before_flush", fail_audit)
    try:
        with pytest.raises(HTTPException) as exc:
            purchases.create_purchase_order(
                schemas.PurchaseOrderCreate(
                    supplier_id=seeded.supplier.supplier_id,
                    branch_id=seeded.branch.branch_id,
                    items=[{
                        "product_id": seeded.p1.product_id,
                        "quantity": 2,
                        "unit_cost": 500,
                    }],
                ),
                db,
                seeded.actor,
            )
        assert exc.value.status_code == 500
    finally:
        event.remove(db, "before_flush", fail_audit)

    assert db.query(models.PurchaseOrder).count() == before


def test_partial_then_final_receipt_increases_exact_stock_and_evidence(db):
    seeded = seed(db, two_items=True)

    first = receive(
        db, seeded,
        {"po_item_id": seeded.i1.po_item_id, "quantity": 2},
    )
    assert first["po_status"] == "partially_received"

    final = receive(
        db, seeded,
        {"po_item_id": seeded.i1.po_item_id, "quantity": 2},
        {"po_item_id": seeded.i2.po_item_id, "quantity": 2},
    )
    assert final["po_status"] == "completed"

    stock = {
        row.product_id: row.stock_quantity
        for row in db.query(models.BranchInventory).all()
    }
    assert stock == {seeded.p1.product_id: 9, seeded.p2.product_id: 2}
    assert db.query(models.PurchaseReceipt).count() == 2
    assert db.query(models.PurchaseReceiptItem).count() == 3
    assert db.query(models.InventoryBatch).filter(
        models.InventoryBatch.receipt_id.isnot(None)
    ).count() == 3
    assert db.query(models.InventoryMovement).filter_by(
        movement_type="PURCHASE_RECEIPT"
    ).count() == 3
    assert db.query(models.AuditLog).filter_by(action="PURCHASE_RECEIPT").count() == 2


def test_cumulative_over_receipt_is_blocked_without_stock_change(db):
    seeded = seed(db)
    receive(db, seeded, {"po_item_id": seeded.i1.po_item_id, "quantity": 3})
    before = db.query(models.BranchInventory).one().stock_quantity

    with pytest.raises(HTTPException) as exc:
        receive(db, seeded, {"po_item_id": seeded.i1.po_item_id, "quantity": 2})
    assert exc.value.status_code == 409
    assert db.query(models.BranchInventory).one().stock_quantity == before
    assert db.query(models.PurchaseReceipt).count() == 1


def test_later_out_of_scope_product_and_mandatory_audit_failure_are_atomic(db):
    seeded = seed(db, two_items=True)
    before = db.query(models.BranchInventory).one().stock_quantity

    seeded.p2.business_id = seeded.foreign_business.business_id
    db.commit()
    with pytest.raises(HTTPException) as scope_exc:
        receive(
            db, seeded,
            {"po_item_id": seeded.i1.po_item_id, "quantity": 1},
            {"po_item_id": seeded.i2.po_item_id, "quantity": 1},
        )
    assert scope_exc.value.status_code == 403
    assert db.query(models.BranchInventory).one().stock_quantity == before
    assert db.query(models.PurchaseReceipt).count() == 0

    seeded.p2.business_id = seeded.business.business_id
    db.commit()

    def fail_audit(session, *_):
        if any(isinstance(row, models.AuditLog) for row in session.new):
            raise RuntimeError("audit write failed")

    event.listen(db, "before_flush", fail_audit)
    try:
        with pytest.raises(HTTPException) as audit_exc:
            receive(db, seeded, {"po_item_id": seeded.i1.po_item_id, "quantity": 1})
        assert audit_exc.value.status_code == 500
    finally:
        event.remove(db, "before_flush", fail_audit)

    assert db.query(models.BranchInventory).one().stock_quantity == before
    assert db.query(models.PurchaseReceipt).count() == 0
    assert db.query(models.InventoryMovement).count() == 0


def test_database_trigger_rejects_direct_cumulative_over_receipt(db):
    seeded = seed(db)
    receipt = models.PurchaseReceipt(
        po_id=seeded.po.po_id, business_id=seeded.business.business_id,
        branch_id=seeded.branch.branch_id, user_id=seeded.actor.user_id,
    )
    db.add(receipt)
    db.flush()
    db.add(models.PurchaseReceiptItem(
        receipt_id=receipt.receipt_id, po_item_id=seeded.i1.po_item_id,
        product_id=seeded.p1.product_id, quantity=5, unit_cost=500,
    ))
    with pytest.raises(IntegrityError):
        db.flush()
