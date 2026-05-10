"""Add subscription and trial fields to businesses table.

Adds:
- trial_ends_at:              when the 14-day trial expires
- subscription_status:        trial | active | past_due | cancelled | expired
- paystack_customer_code:     Paystack customer ID
- paystack_subscription_code: Paystack subscription ID for cancellation/management
- current_period_end:         when the current paid period ends

Existing businesses get subscription_status = 'active' so they are not affected.

Revision ID: 0015_add_subscription
Revises: 0014_add_branding
"""

from alembic import op
import sqlalchemy as sa
from datetime import datetime, timedelta

revision      = "0015_add_subscription"
down_revision = "0014_add_branding"
branch_labels = None
depends_on    = None


def upgrade():
    conn = op.get_bind()

    def sql(s):
        conn.execute(sa.text(s))

    sql("ALTER TABLE businesses ADD COLUMN IF NOT EXISTS trial_ends_at              TIMESTAMP NULL;")
    sql("ALTER TABLE businesses ADD COLUMN IF NOT EXISTS subscription_status         VARCHAR(20) NOT NULL DEFAULT 'active';")
    sql("ALTER TABLE businesses ADD COLUMN IF NOT EXISTS paystack_customer_code      VARCHAR(100) NULL;")
    sql("ALTER TABLE businesses ADD COLUMN IF NOT EXISTS paystack_subscription_code  VARCHAR(100) NULL;")
    sql("ALTER TABLE businesses ADD COLUMN IF NOT EXISTS current_period_end          TIMESTAMP NULL;")

    # Existing businesses are already paying/active — don't disrupt them
    sql("UPDATE businesses SET subscription_status = 'active' WHERE subscription_status = 'active';")


def downgrade():
    conn = op.get_bind()

    def sql(s):
        conn.execute(sa.text(s))

    sql("ALTER TABLE businesses DROP COLUMN IF EXISTS trial_ends_at;")
    sql("ALTER TABLE businesses DROP COLUMN IF EXISTS subscription_status;")
    sql("ALTER TABLE businesses DROP COLUMN IF EXISTS paystack_customer_code;")
    sql("ALTER TABLE businesses DROP COLUMN IF EXISTS paystack_subscription_code;")
    sql("ALTER TABLE businesses DROP COLUMN IF EXISTS current_period_end;")