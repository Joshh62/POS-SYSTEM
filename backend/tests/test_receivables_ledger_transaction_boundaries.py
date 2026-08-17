import os
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, event, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models
from app.routers import debts, ledger


@pytest.fixture(scope="session")
def pg_engine():
    url = os.getenv("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL is required for receivables assurance")
    engine = create_engine(url)
    models.Base.metadata.drop_all(engine)
    models.Base.metadata.create_all(engine)
    ddl = """
    CREATE UNIQUE INDEX IF NOT EXISTS uq_test_ledger_debt_origin
      ON customer_ledger_entries(debt_id) WHERE source_type='debt';
    CREATE UNIQUE INDEX IF NOT EXISTS uq_test_ledger_debt_payment_origin
      ON customer_ledger_entries(debt_payment_id) WHERE debt_payment_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_test_ledger_debt_writeoff
      ON customer_ledger_entries(debt_id) WHERE source_type='debt_writeoff';
    CREATE UNIQUE INDEX IF NOT EXISTS uq_test_ledger_entry_reversal
      ON customer_ledger_entries(reversal_of_entry_id)
      WHERE reversal_of_entry_id IS NOT NULL;
    CREATE OR REPLACE FUNCTION enforce_debt_payment_total() RETURNS trigger AS $$
    DECLARE sold numeric(12,2); prior numeric(12,2);
    BEGIN
      SELECT total_amount INTO sold FROM debts WHERE debt_id=NEW.debt_id FOR UPDATE;
      SELECT COALESCE(SUM(amount),0) INTO prior FROM debt_payments
        WHERE debt_id=NEW.debt_id
          AND (TG_OP='INSERT' OR payment_id<>NEW.payment_id);
      IF NEW.amount<=0 OR prior+NEW.amount>sold THEN
        RAISE EXCEPTION 'cumulative payment exceeds debt total' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END; $$ LANGUAGE plpgsql;
    CREATE TRIGGER trg_enforce_debt_payment_total
      BEFORE INSERT OR UPDATE ON debt_payments
      FOR EACH ROW EXECUTE FUNCTION enforce_debt_payment_total();
    """
    with engine.begin() as connection:
        connection.execute(text(ddl))
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
    business = models.Business(name="Receivables Evidence Business")
    foreign_business = models.Business(name="Foreign Receivables Business")
    db.add_all([business, foreign_business])
    db.flush()
    branch = models.Branch(name="Branch", business_id=business.business_id)
    other_branch = models.Branch(name="Other", business_id=business.business_id)
    foreign_branch = models.Branch(name="Foreign", business_id=foreign_business.business_id)
    db.add_all([branch, other_branch, foreign_branch])
    db.flush()
    user = models.User(
        full_name="Manager",
        username=f"receivables-{branch.branch_id}",
        password_hash="x",
        role="manager",
        branch_id=branch.branch_id,
        business_id=business.business_id,
    )
    admin = models.User(
        full_name="Admin",
        username=f"receivables-admin-{branch.branch_id}",
        password_hash="x",
        role="admin",
        branch_id=branch.branch_id,
        business_id=business.business_id,
    )
    customer = models.Customer(
        business_id=business.business_id,
        full_name="Customer",
        phone=f"0800{branch.branch_id}",
        credit_enabled=True,
        credit_limit=10000,
    )
    foreign_customer = models.Customer(
        business_id=foreign_business.business_id,
        full_name="Foreign",
        phone=f"0900{branch.branch_id}",
        credit_enabled=True,
    )
    db.add_all([user, admin, customer, foreign_customer])
    db.flush()
    db.commit()
    actor = SimpleNamespace(
        user_id=user.user_id, role="manager",
        branch_id=branch.branch_id, business_id=business.business_id,
    )
    admin_actor = SimpleNamespace(
        user_id=admin.user_id, role="admin",
        branch_id=branch.branch_id, business_id=business.business_id,
    )
    return SimpleNamespace(
        business=business, branch=branch, other_branch=other_branch,
        foreign_branch=foreign_branch, customer=customer,
        foreign_customer=foreign_customer, actor=actor, admin=admin_actor,
    )


def create_debt(db, seeded, total=1000, paid=0):
    return debts.create_debt(
        debts.DebtCreate(
            customer_id=seeded.customer.customer_id,
            total_amount=total,
            amount_paid=paid,
            branch_id=seeded.branch.branch_id,
            description="Evidence debt",
        ),
        db,
        seeded.actor,
    )


def test_debt_creation_posts_exact_immutable_ledger_evidence(db):
    seeded = seed(db)
    result = create_debt(db, seeded, total=1000, paid=250)
    debt = db.query(models.Debt).filter_by(debt_id=result["debt_id"]).one()
    assert float(debt.total_amount) == 1000
    assert float(debt.amount_paid) == 250
    assert float(debt.balance) == 750
    assert debt.status == "partial"
    entries = db.query(models.CustomerLedgerEntry).filter_by(debt_id=debt.debt_id).all()
    assert [(e.entry_type, float(e.amount), e.source_type) for e in entries] == [
        ("debit", 1000.0, "debt"),
        ("credit", 250.0, "debt_payment"),
    ]
    assert entries[1].debt_payment_id is not None
    assert db.query(models.AuditLog).filter_by(
        table_name="debts", record_id=debt.debt_id
    ).count() == 1


def test_scope_and_overpayment_are_rejected_without_mutation(db):
    seeded = seed(db)
    with pytest.raises(HTTPException) as scope:
        debts.create_debt(
            debts.DebtCreate(
                customer_id=seeded.foreign_customer.customer_id,
                total_amount=100,
                branch_id=seeded.branch.branch_id,
            ),
            db,
            seeded.actor,
        )
    assert scope.value.status_code == 403

    result = create_debt(db, seeded, total=500)
    debt_id = result["debt_id"]
    with pytest.raises(HTTPException) as overpay:
        debts.record_payment(
            debt_id,
            debts.DebtPaymentCreate(amount=501, payment_method="cash"),
            db,
            seeded.actor,
        )
    assert overpay.value.status_code == 409
    debt = db.query(models.Debt).filter_by(debt_id=debt_id).one()
    assert float(debt.balance) == 500
    assert db.query(models.DebtPayment).filter_by(debt_id=debt_id).count() == 0


def test_partial_then_final_payment_reconciles_debt_and_ledger(db):
    seeded = seed(db)
    debt_id = create_debt(db, seeded, total=900)["debt_id"]
    debts.record_payment(
        debt_id, debts.DebtPaymentCreate(amount=400, payment_method="transfer"),
        db, seeded.actor,
    )
    final = debts.record_payment(
        debt_id, debts.DebtPaymentCreate(amount=500, payment_method="card"),
        db, seeded.actor,
    )
    assert final["debt"]["status"] == "paid"
    assert final["debt"]["balance"] == 0
    assert db.query(models.DebtPayment).filter_by(debt_id=debt_id).count() == 2
    credits = db.query(models.CustomerLedgerEntry).filter_by(
        debt_id=debt_id, entry_type="credit"
    ).all()
    assert sum(float(row.amount) for row in credits) == 900
    assert all(row.debt_payment_id for row in credits)


def test_audit_failure_rolls_back_debt_payment_and_ledger(db):
    seeded = seed(db)
    debt_id = create_debt(db, seeded, total=700)["debt_id"]
    before_entries = db.query(models.CustomerLedgerEntry).count()

    def fail_audit(session, *_):
        if any(isinstance(row, models.AuditLog) for row in session.new):
            raise RuntimeError("audit write failed")

    event.listen(db, "before_flush", fail_audit)
    try:
        with pytest.raises(HTTPException) as exc:
            debts.record_payment(
                debt_id, debts.DebtPaymentCreate(amount=200, payment_method="cash"),
                db, seeded.actor,
            )
        assert exc.value.status_code == 500
    finally:
        event.remove(db, "before_flush", fail_audit)

    debt = db.query(models.Debt).filter_by(debt_id=debt_id).one()
    assert float(debt.balance) == 700
    assert db.query(models.DebtPayment).filter_by(debt_id=debt_id).count() == 0
    assert db.query(models.CustomerLedgerEntry).count() == before_entries


def test_writeoff_and_reversal_are_one_time_immutable_entries(db):
    seeded = seed(db)
    debt_id = create_debt(db, seeded, total=600, paid=100)["debt_id"]
    written = debts.write_off_debt(debt_id, db, seeded.admin)
    assert written["amount"] == 500
    debt = db.query(models.Debt).filter_by(debt_id=debt_id).one()
    assert debt.status == "written_off"
    assert float(debt.written_off_amount) == 500
    with pytest.raises(HTTPException) as duplicate:
        debts.write_off_debt(debt_id, db, seeded.admin)
    assert duplicate.value.status_code == 409

    manual = ledger.add_debit(
        ledger.DebitEntry(
            customer_id=seeded.customer.customer_id,
            amount=200,
            branch_id=seeded.branch.branch_id,
            description="Manual correction candidate",
        ),
        db,
        seeded.actor,
    )
    debit_id = manual["entry_id"]
    reversal = ledger.delete_entry(debit_id, db, seeded.admin)
    assert reversal["reversal_entry_id"]
    assert db.query(models.CustomerLedgerEntry).filter_by(entry_id=debit_id).count() == 1
    with pytest.raises(HTTPException) as second:
        ledger.delete_entry(debit_id, db, seeded.admin)
    assert second.value.status_code == 409


def test_database_trigger_blocks_direct_cumulative_overpayment(db):
    seeded = seed(db)
    debt_id = create_debt(db, seeded, total=300)["debt_id"]
    db.add(models.DebtPayment(
        debt_id=debt_id, user_id=seeded.actor.user_id,
        amount=301, payment_method="cash",
    ))
    with pytest.raises(IntegrityError):
        db.flush()
