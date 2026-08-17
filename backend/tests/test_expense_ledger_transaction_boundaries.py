import os
from decimal import Decimal
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, event, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models
from app.routers import expenses


@pytest.fixture(scope="session")
def pg_engine():
    url = os.getenv("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL is required for expense-ledger assurance")
    engine = create_engine(url)
    models.Base.metadata.drop_all(engine)
    models.Base.metadata.create_all(engine)
    with engine.begin() as connection:
        connection.execute(text(
            """
            CREATE OR REPLACE FUNCTION enforce_expense_ledger_guard()
            RETURNS trigger AS $$
            DECLARE branch_business integer;
            DECLARE actor_business integer;
            DECLARE actor_role text;
            BEGIN
              IF TG_OP='DELETE' THEN
                RAISE EXCEPTION 'expense ledger rows cannot be deleted'
                  USING ERRCODE='23514';
              END IF;
              SELECT business_id INTO branch_business FROM branches
                WHERE branch_id=NEW.branch_id FOR UPDATE;
              SELECT business_id, role INTO actor_business, actor_role FROM users
                WHERE user_id=CASE
                  WHEN NEW.status='reversed' THEN NEW.reversed_by
                  ELSE NEW.user_id
                END;
              IF branch_business IS NULL OR branch_business<>NEW.business_id THEN
                RAISE EXCEPTION 'expense branch scope mismatch'
                  USING ERRCODE='23514';
              END IF;
              IF actor_role IS NULL
                 OR (actor_role<>'superadmin' AND actor_business<>NEW.business_id) THEN
                RAISE EXCEPTION 'expense actor scope mismatch'
                  USING ERRCODE='23514';
              END IF;
              IF TG_OP='UPDATE' THEN
                IF OLD.status<>'active' OR NEW.status<>'reversed'
                   OR NEW.business_id IS DISTINCT FROM OLD.business_id
                   OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
                   OR NEW.user_id IS DISTINCT FROM OLD.user_id
                   OR NEW.category IS DISTINCT FROM OLD.category
                   OR NEW.amount IS DISTINCT FROM OLD.amount
                   OR NEW.description IS DISTINCT FROM OLD.description
                   OR NEW.expense_date IS DISTINCT FROM OLD.expense_date
                   OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
                  RAISE EXCEPTION 'expense ledger mutation is not permitted'
                    USING ERRCODE='23514';
                END IF;
              END IF;
              RETURN NEW;
            END; $$ LANGUAGE plpgsql;
            CREATE TRIGGER trg_enforce_expense_ledger_guard
              BEFORE INSERT OR UPDATE OR DELETE ON expenses
              FOR EACH ROW EXECUTE FUNCTION enforce_expense_ledger_guard();
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


def seed(db):
    business = models.Business(name="Expense Business")
    foreign_business = models.Business(name="Foreign Expense Business")
    db.add_all([business, foreign_business])
    db.flush()
    branch = models.Branch(name="Branch", business_id=business.business_id)
    other_branch = models.Branch(name="Other", business_id=business.business_id)
    foreign_branch = models.Branch(
        name="Foreign", business_id=foreign_business.business_id
    )
    db.add_all([branch, other_branch, foreign_branch])
    db.flush()
    admin = models.User(
        full_name="Admin", username=f"expense-admin-{branch.branch_id}",
        password_hash="x", role="admin", branch_id=branch.branch_id,
        business_id=business.business_id,
    )
    manager = models.User(
        full_name="Manager", username=f"expense-manager-{branch.branch_id}",
        password_hash="x", role="manager", branch_id=branch.branch_id,
        business_id=business.business_id,
    )
    db.add_all([admin, manager])
    db.flush()
    db.commit()
    return SimpleNamespace(
        business=business, foreign_business=foreign_business,
        branch=branch, other_branch=other_branch, foreign_branch=foreign_branch,
        admin=SimpleNamespace(
            user_id=admin.user_id, role="admin", branch_id=branch.branch_id,
            business_id=business.business_id,
        ),
        manager=SimpleNamespace(
            user_id=manager.user_id, role="manager", branch_id=branch.branch_id,
            business_id=business.business_id,
        ),
    )


def request(**overrides):
    values = {
        "category": "Utilities",
        "amount": Decimal("1250.55"),
        "description": "Electricity",
    }
    values.update(overrides)
    return expenses.ExpenseCreate(**values)


def create(db, seeded, actor=None, **overrides):
    return expenses.create_expense(
        request(**overrides), db, actor or seeded.admin
    )


def test_contract_rejects_nonpositive_or_overprecision_amounts():
    for value in (0, -1, Decimal("1.001")):
        with pytest.raises(ValidationError):
            request(amount=value)


def test_admin_branch_scope_and_manager_assignment_are_enforced(db):
    seeded = seed(db)
    with pytest.raises(HTTPException) as foreign:
        create(db, seeded, branch_id=seeded.foreign_branch.branch_id)
    assert foreign.value.status_code == 403
    result = create(
        db, seeded, actor=seeded.manager,
        branch_id=seeded.other_branch.branch_id,
    )
    assert result["branch_id"] == seeded.branch.branch_id
    assert db.query(models.Expense).count() == 1


def test_create_records_exact_amount_and_mandatory_audit(db):
    seeded = seed(db)
    result = create(db, seeded)
    row = db.get(models.Expense, result["expense_id"])
    audit = db.query(models.AuditLog).filter_by(
        action="EXPENSE_CREATE", record_id=row.expense_id
    ).one()
    assert row.amount == Decimal("1250.55")
    assert row.status == "active"
    assert str(row.expense_id) in audit.description


def test_reversal_preserves_original_and_excludes_summary(db):
    seeded = seed(db)
    result = create(db, seeded)
    reversed_result = expenses.reverse_expense(
        result["expense_id"], "Duplicate entry", db, seeded.admin
    )
    assert reversed_result["status"] == "reversed"
    row = db.get(models.Expense, result["expense_id"])
    assert row.amount == Decimal("1250.55")
    assert row.reversal_reason == "Duplicate entry"
    assert db.query(models.AuditLog).filter_by(
        action="EXPENSE_REVERSE", record_id=row.expense_id
    ).count() == 1
    summary = expenses.expense_summary(None, None, None, db, seeded.admin)
    assert summary == {"total": 0.0, "categories": []}
    with pytest.raises(HTTPException) as duplicate:
        expenses.reverse_expense(
            result["expense_id"], "Second attempt", db, seeded.admin
        )
    assert duplicate.value.status_code == 409


def test_create_and_reversal_audit_failures_are_atomic(db):
    seeded = seed(db)

    def fail_audit(session, *_):
        if any(isinstance(row, models.AuditLog) for row in session.new):
            raise RuntimeError("audit write failed")

    event.listen(db, "before_flush", fail_audit)
    try:
        with pytest.raises(HTTPException) as create_exc:
            create(db, seeded)
        assert create_exc.value.status_code == 500
    finally:
        event.remove(db, "before_flush", fail_audit)
    assert db.query(models.Expense).count() == 0

    result = create(db, seeded)
    event.listen(db, "before_flush", fail_audit)
    try:
        with pytest.raises(HTTPException) as reverse_exc:
            expenses.reverse_expense(
                result["expense_id"], "Incorrect entry", db, seeded.admin
            )
        assert reverse_exc.value.status_code == 500
    finally:
        event.remove(db, "before_flush", fail_audit)
    row = db.get(models.Expense, result["expense_id"])
    assert row.status == "active"
    assert row.reversed_at is None


def test_database_rejects_scope_mismatch_mutation_and_delete(db):
    seeded = seed(db)
    bad = models.Expense(
        business_id=seeded.business.business_id,
        branch_id=seeded.foreign_branch.branch_id,
        user_id=seeded.admin.user_id,
        category="Utilities",
        amount=100,
        status="active",
    )
    with pytest.raises(IntegrityError):
        with db.begin_nested():
            db.add(bad)
            db.flush()

    result = create(db, seeded)
    row = db.get(models.Expense, result["expense_id"])
    with pytest.raises(IntegrityError):
        with db.begin_nested():
            row.amount = Decimal("1.00")
            db.flush()
    db.refresh(row)
    row = db.get(models.Expense, result["expense_id"])
    with pytest.raises(IntegrityError):
        with db.begin_nested():
            db.delete(row)
            db.flush()
