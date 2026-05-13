"""Add report_hour to businesses — admin-configurable WhatsApp report time.

Default is 20 (8PM Lagos time). Admins can set any hour 0-23.

Revision ID: 0018_add_report_hour
Revises: 0017_add_deletion_requested_at
"""

from alembic import op
import sqlalchemy as sa

revision      = "0018_add_report_hour"
down_revision = "0017_add_deletion_requested_at"
branch_labels = None
depends_on    = None


def upgrade():
    conn = op.get_bind()
    conn.execute(sa.text(
        "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS "
        "report_hour INTEGER NOT NULL DEFAULT 20;"
    ))


def downgrade():
    conn = op.get_bind()
    conn.execute(sa.text(
        "ALTER TABLE businesses DROP COLUMN IF EXISTS report_hour;"
    ))