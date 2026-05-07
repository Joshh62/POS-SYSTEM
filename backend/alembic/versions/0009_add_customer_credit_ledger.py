"""Add customer credit ledger system.

- Drops debts and debt_payments tables (test data only)
- Adds business_id, credit_enabled, credit_notes, credit_due_days,
  credit_limit to customers table
- Creates customer_ledger_entries table

SAFE for test data — production data should be backed up first.
Preview with: alembic upgrade head --sql before running.

Revision ID: 0009_add_customer_credit_ledger
Revises: 0008_add_debts
"""

from alembic import op
import sqlalchemy as sa

revision      = "0009_add_customer_credit_ledger"
down_revision = "0008_add_debts"
branch_labels = None
depends_on    = None


def upgrade():
    conn = op.get_bind()

    def sql(s):
        conn.execute(sa.text(s))

    # ── Drop old debt tables ──────────────────────────────────────────────────
    sql("DROP TABLE IF EXISTS debt_payments CASCADE;")
    sql("DROP TABLE IF EXISTS debts CASCADE;")

    # ── Add credit fields to customers ────────────────────────────────────────
    sql("ALTER TABLE customers ADD COLUMN IF NOT EXISTS business_id INTEGER REFERENCES businesses(business_id);")
    sql("UPDATE customers SET business_id = 1 WHERE business_id IS NULL;")
    sql("ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_enabled BOOLEAN NOT NULL DEFAULT FALSE;")
    sql("ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(12,2) DEFAULT NULL;")
    sql("ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_due_days INTEGER NOT NULL DEFAULT 30;")
    sql("ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_notes VARCHAR(500) DEFAULT NULL;")

    # ── Create customer_ledger_entries ────────────────────────────────────────
    sql("""
        CREATE TABLE IF NOT EXISTS customer_ledger_entries (
            entry_id    SERIAL PRIMARY KEY,
            business_id INTEGER NOT NULL REFERENCES businesses(business_id),
            branch_id   INTEGER NOT NULL REFERENCES branches(branch_id),
            customer_id INTEGER NOT NULL REFERENCES customers(customer_id),
            user_id     INTEGER NOT NULL REFERENCES users(user_id),
            entry_type  VARCHAR(10) NOT NULL CHECK (entry_type IN ('debit','credit')),
            amount      NUMERIC(12,2) NOT NULL CHECK (amount > 0),
            description VARCHAR(500),
            reference_id INTEGER DEFAULT NULL,
            due_date    DATE DEFAULT NULL,
            created_at  TIMESTAMP NOT NULL DEFAULT NOW()
        );
    """)

    sql("CREATE INDEX IF NOT EXISTS ix_ledger_customer ON customer_ledger_entries(customer_id);")
    sql("CREATE INDEX IF NOT EXISTS ix_ledger_business ON customer_ledger_entries(business_id);")


def downgrade():
    conn = op.get_bind()

    def sql(s):
        conn.execute(sa.text(s))

    sql("DROP TABLE IF EXISTS customer_ledger_entries CASCADE;")
    sql("ALTER TABLE customers DROP COLUMN IF EXISTS credit_notes;")
    sql("ALTER TABLE customers DROP COLUMN IF EXISTS credit_due_days;")
    sql("ALTER TABLE customers DROP COLUMN IF EXISTS credit_limit;")
    sql("ALTER TABLE customers DROP COLUMN IF EXISTS credit_enabled;")
    sql("ALTER TABLE customers DROP COLUMN IF EXISTS business_id;")