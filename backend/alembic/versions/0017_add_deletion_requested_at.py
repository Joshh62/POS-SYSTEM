"""Add deletion_requested_at to businesses for GDPR/account deletion flow.

Revision ID: 0017_add_deletion_requested_at
Revises: 0016_add_pending_plan
"""

from alembic import op
import sqlalchemy as sa

revision      = "0017_add_deletion_requested_at"
down_revision = "0016_add_pending_plan"
branch_labels = None
depends_on    = None


def upgrade():
    conn = op.get_bind()
    conn.execute(sa.text(
        "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS "
        "deletion_requested_at TIMESTAMP NULL;"
    ))


def downgrade():
    conn = op.get_bind()
    conn.execute(sa.text(
        "ALTER TABLE businesses DROP COLUMN IF EXISTS deletion_requested_at;"
    ))