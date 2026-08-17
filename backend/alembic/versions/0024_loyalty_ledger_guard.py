"""add sale-linked loyalty ledger and database guards

Revision ID: 0024_loyalty_ledger_guard
Revises: 0023_stock_transfer_guard
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "0024_loyalty_ledger_guard"
down_revision = "0023_stock_transfer_guard"
branch_labels = None
depends_on = None


def _columns(bind, table):
    return {column["name"] for column in inspect(bind).get_columns(table)}


def upgrade():
    bind = op.get_bind()
    loyalty_columns = _columns(bind, "customer_loyalty")
    if "lifetime_expired" not in loyalty_columns:
        op.add_column(
            "customer_loyalty",
            sa.Column(
                "lifetime_expired", sa.Integer(),
                nullable=False, server_default="0",
            ),
        )

    transaction_columns = _columns(bind, "loyalty_transactions")
    additions = {
        "balance_before": sa.Column("balance_before", sa.Integer(), nullable=True),
        "balance_after": sa.Column("balance_after", sa.Integer(), nullable=True),
        "rate_snapshot": sa.Column("rate_snapshot", sa.Numeric(12, 4), nullable=True),
        "monetary_amount": sa.Column(
            "monetary_amount", sa.Numeric(12, 2), nullable=True
        ),
    }
    for name, column in additions.items():
        if name not in transaction_columns:
            op.add_column("loyalty_transactions", column)

    # Historical transaction snapshots are not inferred or represented as
    # reconciled. NOT VALID constraints protect all new and updated rows.
    op.execute(
        """
        ALTER TABLE customer_loyalty
        ADD CONSTRAINT ck_customer_loyalty_nonnegative_totals_guard
        CHECK (
          points_balance >= 0 AND lifetime_earned >= 0
          AND lifetime_redeemed >= 0 AND lifetime_expired >= 0
        ) NOT VALID
        """
    )
    op.execute(
        """
        ALTER TABLE customer_loyalty
        ADD CONSTRAINT ck_customer_loyalty_exact_balance_guard
        CHECK (
          points_balance = lifetime_earned - lifetime_redeemed - lifetime_expired
        ) NOT VALID
        """
    )
    op.execute(
        """
        ALTER TABLE loyalty_transactions
        ADD CONSTRAINT ck_loyalty_transactions_evidence_complete
        CHECK (
          tx_type IN ('earn','redeem','expire')
          AND balance_before IS NOT NULL AND balance_after IS NOT NULL
          AND monetary_amount IS NOT NULL AND monetary_amount >= 0
          AND balance_before >= 0 AND balance_after >= 0
          AND balance_after = balance_before + points
          AND (
            (tx_type='earn' AND points > 0)
            OR (tx_type IN ('redeem','expire') AND points < 0)
          )
          AND (
            (tx_type IN ('earn','redeem') AND sale_id IS NOT NULL)
            OR (tx_type='expire' AND sale_id IS NULL)
          )
          AND (
            (tx_type IN ('earn','redeem') AND rate_snapshot IS NOT NULL)
            OR (tx_type='expire' AND rate_snapshot IS NULL)
          )
        ) NOT VALID
        """
    )
    # These indexes are the concurrency-safe duplicate guards.  Migration
    # failure on legacy duplicates is intentional: historical rows must be
    # reconciled explicitly rather than silently discarded or reinterpreted.
    op.execute(
        """
        CREATE UNIQUE INDEX uq_customer_loyalty_business_customer_guard
          ON customer_loyalty (business_id, customer_id);
        CREATE UNIQUE INDEX uq_loyalty_sale_earn_guard
          ON loyalty_transactions (sale_id) WHERE tx_type='earn';
        CREATE UNIQUE INDEX uq_loyalty_sale_redeem_guard
          ON loyalty_transactions (sale_id) WHERE tx_type='redeem';
        """
    )
    op.execute(
        """
        CREATE OR REPLACE FUNCTION enforce_loyalty_account_scope()
        RETURNS trigger AS $$
        BEGIN
          PERFORM 1 FROM customers
            WHERE customer_id=NEW.customer_id
              AND business_id=NEW.business_id
            FOR UPDATE;
          IF NOT FOUND THEN
            RAISE EXCEPTION 'loyalty customer scope mismatch' USING ERRCODE='23514';
          END IF;
          IF EXISTS (
            SELECT 1 FROM customer_loyalty
             WHERE business_id=NEW.business_id
               AND customer_id=NEW.customer_id
               AND loyalty_id<>COALESCE(NEW.loyalty_id,0)
          ) THEN
            RAISE EXCEPTION 'duplicate loyalty account' USING ERRCODE='23505';
          END IF;
          RETURN NEW;
        END; $$ LANGUAGE plpgsql;
        CREATE TRIGGER trg_enforce_loyalty_account_scope
          BEFORE INSERT OR UPDATE ON customer_loyalty
          FOR EACH ROW EXECUTE FUNCTION enforce_loyalty_account_scope();
        """
    )
    op.execute(
        """
        CREATE OR REPLACE FUNCTION enforce_loyalty_transaction_evidence()
        RETURNS trigger AS $$
        DECLARE account customer_loyalty%ROWTYPE;
        DECLARE target_sale sales%ROWTYPE;
        DECLARE sale_business integer;
        BEGIN
          SELECT * INTO account FROM customer_loyalty
            WHERE loyalty_id=NEW.loyalty_id FOR UPDATE;
          IF account.loyalty_id IS NULL
             OR account.business_id<>NEW.business_id
             OR account.customer_id<>NEW.customer_id
             OR account.points_balance<>NEW.balance_after THEN
            RAISE EXCEPTION 'loyalty transaction account mismatch' USING ERRCODE='23514';
          END IF;

          IF NEW.tx_type IN ('earn','redeem') THEN
            SELECT * INTO target_sale FROM sales
              WHERE sale_id=NEW.sale_id FOR UPDATE;
            SELECT business_id INTO sale_business FROM branches
              WHERE branch_id=target_sale.branch_id;
            IF target_sale.sale_id IS NULL
               OR target_sale.customer_id<>NEW.customer_id
               OR sale_business<>NEW.business_id
               OR target_sale.status<>'completed' THEN
              RAISE EXCEPTION 'loyalty sale scope mismatch' USING ERRCODE='23514';
            END IF;
            IF EXISTS (
              SELECT 1 FROM loyalty_transactions
               WHERE sale_id=NEW.sale_id AND tx_type=NEW.tx_type
                 AND tx_id<>COALESCE(NEW.tx_id,0)
            ) THEN
              RAISE EXCEPTION 'duplicate loyalty sale posting' USING ERRCODE='23505';
            END IF;
          END IF;
          RETURN NEW;
        END; $$ LANGUAGE plpgsql;
        CREATE TRIGGER trg_enforce_loyalty_transaction_evidence
          BEFORE INSERT OR UPDATE ON loyalty_transactions
          FOR EACH ROW EXECUTE FUNCTION enforce_loyalty_transaction_evidence();
        """
    )


def downgrade():
    op.execute(
        "DROP TRIGGER IF EXISTS trg_enforce_loyalty_transaction_evidence "
        "ON loyalty_transactions"
    )
    op.execute("DROP FUNCTION IF EXISTS enforce_loyalty_transaction_evidence()")
    op.execute(
        "DROP TRIGGER IF EXISTS trg_enforce_loyalty_account_scope "
        "ON customer_loyalty"
    )
    op.execute("DROP FUNCTION IF EXISTS enforce_loyalty_account_scope()")
    op.execute("DROP INDEX IF EXISTS uq_loyalty_sale_redeem_guard")
    op.execute("DROP INDEX IF EXISTS uq_loyalty_sale_earn_guard")
    op.execute("DROP INDEX IF EXISTS uq_customer_loyalty_business_customer_guard")
    op.drop_constraint(
        "ck_loyalty_transactions_evidence_complete",
        "loyalty_transactions", type_="check",
    )
    op.drop_constraint(
        "ck_customer_loyalty_nonnegative_totals_guard",
        "customer_loyalty", type_="check",
    )
    op.drop_constraint(
        "ck_customer_loyalty_exact_balance_guard",
        "customer_loyalty", type_="check",
    )
    op.drop_column("loyalty_transactions", "monetary_amount")
    op.drop_column("loyalty_transactions", "rate_snapshot")
    op.drop_column("loyalty_transactions", "balance_after")
    op.drop_column("loyalty_transactions", "balance_before")
    op.drop_column("customer_loyalty", "lifetime_expired")
