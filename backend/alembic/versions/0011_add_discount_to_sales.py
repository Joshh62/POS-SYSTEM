"""Add discount column to sales table.

Stores the loyalty points discount applied at checkout.
Enables discount reporting without computing from sale items each time.

SAFE MIGRATION — adds nullable column with default 0.

Revision ID: 0011_add_discount_to_sales
Revises: 0010_add_loyalty
"""

from alembic import op
import sqlalchemy as sa

revision      = "0011_add_discount_to_sales"
down_revision = "0010_add_loyalty"
branch_labels = None
depends_on    = None


def upgrade():
    conn = op.get_bind()
    conn.execute(sa.text(
        "ALTER TABLE sales ADD COLUMN IF NOT EXISTS discount NUMERIC(12,2) NOT NULL DEFAULT 0;"
    ))


def downgrade():
    conn = op.get_bind()
    conn.execute(sa.text(
        "ALTER TABLE sales DROP COLUMN IF EXISTS discount;"
    ))