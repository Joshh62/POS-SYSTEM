"""Add pending plan fields for scheduled downgrades.

When a customer downgrades, the new plan is stored as pending
and applied automatically at the next renewal.

Revision ID: 0016_add_pending_plan
Revises: 0015_add_subscription
"""

from alembic import op
import sqlalchemy as sa

revision      = "0016_add_pending_plan"
down_revision = "0015_add_subscription"
branch_labels = None
depends_on    = None


def upgrade():
    conn = op.get_bind()

    def sql(s):
        conn.execute(sa.text(s))

    sql("ALTER TABLE businesses ADD COLUMN IF NOT EXISTS pending_plan    VARCHAR(20) NULL;")
    sql("ALTER TABLE businesses ADD COLUMN IF NOT EXISTS pending_billing VARCHAR(10) NULL;")


def downgrade():
    conn = op.get_bind()

    def sql(s):
        conn.execute(sa.text(s))

    sql("ALTER TABLE businesses DROP COLUMN IF EXISTS pending_plan;")
    sql("ALTER TABLE businesses DROP COLUMN IF EXISTS pending_billing;")