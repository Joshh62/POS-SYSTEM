"""add immutable expense and cash-outflow ledger guards

Revision ID: 0025_expense_ledger_guard
Revises: 0024_loyalty_ledger_guard
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "0025_expense_ledger_guard"
down_revision = "0024_loyalty_ledger_guard"
branch_labels = None
depends_on = None


def _columns(bind, table):
    return {column["name"] for column in inspect(bind).get_columns(table)}


def upgrade():
    bind = op.get_bind()
    columns = _columns(bind, "expenses")
    additions = {
        "status": sa.Column(
            "status", sa.String(20), nullable=False, server_default="active"
        ),
        "reversed_at": sa.Column("reversed_at", sa.DateTime(), nullable=True),
        "reversed_by": sa.Column(
            "reversed_by", sa.Integer(),
            sa.ForeignKey("users.user_id"), nullable=True,
        ),
        "reversal_reason": sa.Column(
            "reversal_reason", sa.String(500), nullable=True
        ),
    }
    for name, column in additions.items():
        if name not in columns:
            op.add_column("expenses", column)

    op.execute(
        """
        ALTER TABLE expenses
          ADD CONSTRAINT ck_expense_amount_positive_guard
          CHECK (amount > 0) NOT VALID;
        ALTER TABLE expenses
          ADD CONSTRAINT ck_expense_status_guard
          CHECK (status IN ('active','reversed')) NOT VALID;
        ALTER TABLE expenses
          ADD CONSTRAINT ck_expense_reversal_evidence_guard
          CHECK (
            (status='active' AND reversed_at IS NULL AND reversed_by IS NULL
             AND reversal_reason IS NULL)
            OR
            (status='reversed' AND reversed_at IS NOT NULL AND reversed_by IS NOT NULL
             AND reversal_reason IS NOT NULL AND length(trim(reversal_reason)) >= 3)
          ) NOT VALID;
        """
    )
    op.execute(
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
            IF OLD.status<>'active'
               OR NEW.status<>'reversed'
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
    )


def downgrade():
    op.execute(
        "DROP TRIGGER IF EXISTS trg_enforce_expense_ledger_guard ON expenses"
    )
    op.execute("DROP FUNCTION IF EXISTS enforce_expense_ledger_guard()")
    for name in [
        "ck_expense_reversal_evidence_guard",
        "ck_expense_status_guard",
        "ck_expense_amount_positive_guard",
    ]:
        op.drop_constraint(name, "expenses", type_="check")
    op.drop_column("expenses", "reversal_reason")
    op.drop_column("expenses", "reversed_by")
    op.drop_column("expenses", "reversed_at")
    op.drop_column("expenses", "status")
