"""Add customer loyalty system.

- customer_loyalty: points balance per customer per business
- loyalty_transactions: full history of earned/redeemed/expired points
- Adds loyalty_earn_rate, loyalty_redeem_rate to businesses table

SAFE MIGRATION — only adds new tables and columns.
Preview with: alembic upgrade head --sql before running.

Revision ID: 0010_add_loyalty
Revises: 0009_add_customer_credit_ledger
"""

from alembic import op
import sqlalchemy as sa

revision      = "0010_add_loyalty"
down_revision = "0009_add_customer_credit_ledger"
branch_labels = None
depends_on    = None


def upgrade():
    conn = op.get_bind()

    def sql(s):
        conn.execute(sa.text(s))

    # ── Loyalty settings on businesses ────────────────────────────────────────
    # earn_rate:   points awarded per ₦100 spent (default 1)
    # redeem_rate: naira value per point (default 5, so 100pts = ₦500)
    sql("ALTER TABLE businesses ADD COLUMN IF NOT EXISTS loyalty_earn_rate NUMERIC(6,2) NOT NULL DEFAULT 1;")
    sql("ALTER TABLE businesses ADD COLUMN IF NOT EXISTS loyalty_redeem_rate NUMERIC(6,2) NOT NULL DEFAULT 5;")

    # ── customer_loyalty: current points balance per customer ─────────────────
    sql("""
        CREATE TABLE IF NOT EXISTS customer_loyalty (
            loyalty_id       SERIAL PRIMARY KEY,
            business_id      INTEGER NOT NULL REFERENCES businesses(business_id),
            customer_id      INTEGER NOT NULL REFERENCES customers(customer_id),
            points_balance   INTEGER NOT NULL DEFAULT 0,
            lifetime_earned  INTEGER NOT NULL DEFAULT 0,
            lifetime_redeemed INTEGER NOT NULL DEFAULT 0,
            last_activity_at  TIMESTAMP NOT NULL DEFAULT NOW(),
            created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
            UNIQUE (business_id, customer_id)
        );
    """)

    sql("CREATE INDEX IF NOT EXISTS ix_loyalty_customer ON customer_loyalty(customer_id);")
    sql("CREATE INDEX IF NOT EXISTS ix_loyalty_business ON customer_loyalty(business_id);")

    # ── loyalty_transactions: full audit trail ────────────────────────────────
    # tx_type: earn | redeem | expire
    sql("""
        CREATE TABLE IF NOT EXISTS loyalty_transactions (
            tx_id        SERIAL PRIMARY KEY,
            loyalty_id   INTEGER NOT NULL REFERENCES customer_loyalty(loyalty_id),
            business_id  INTEGER NOT NULL REFERENCES businesses(business_id),
            customer_id  INTEGER NOT NULL REFERENCES customers(customer_id),
            user_id      INTEGER NOT NULL REFERENCES users(user_id),
            tx_type      VARCHAR(10) NOT NULL CHECK (tx_type IN ('earn','redeem','expire')),
            points       INTEGER NOT NULL,
            sale_id      INTEGER REFERENCES sales(sale_id),
            description  VARCHAR(500),
            created_at   TIMESTAMP NOT NULL DEFAULT NOW()
        );
    """)

    sql("CREATE INDEX IF NOT EXISTS ix_loyalty_tx_customer ON loyalty_transactions(customer_id);")
    sql("CREATE INDEX IF NOT EXISTS ix_loyalty_tx_business ON loyalty_transactions(business_id);")


def downgrade():
    conn = op.get_bind()

    def sql(s):
        conn.execute(sa.text(s))

    sql("DROP TABLE IF EXISTS loyalty_transactions CASCADE;")
    sql("DROP TABLE IF EXISTS customer_loyalty CASCADE;")
    sql("ALTER TABLE businesses DROP COLUMN IF EXISTS loyalty_redeem_rate;")
    sql("ALTER TABLE businesses DROP COLUMN IF EXISTS loyalty_earn_rate;")