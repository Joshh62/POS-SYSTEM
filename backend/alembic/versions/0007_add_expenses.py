"""Add expenses table for business expense tracking.

Expenses are business-level outgoings (rent, fuel, utilities, etc.)
that reduce net profit. Each expense belongs to a business and branch,
recorded by a specific user.

SAFE MIGRATION — only adds a new table.
Preview with: alembic upgrade head --sql before running.

Revision ID: 0007_add_expenses
Revises: 0006_add_features_to_businesses
"""

from alembic import op
import sqlalchemy as sa

revision      = "0007_add_expenses"
down_revision = "0006_add_features_to_businesses"
branch_labels = None
depends_on    = None


def upgrade():
    op.create_table(
        "expenses",
        sa.Column("expense_id",   sa.Integer,     primary_key=True, index=True),
        sa.Column("business_id",  sa.Integer,     sa.ForeignKey("businesses.business_id"), nullable=False, index=True),
        sa.Column("branch_id",    sa.Integer,     sa.ForeignKey("branches.branch_id"),     nullable=False),
        sa.Column("user_id",      sa.Integer,     sa.ForeignKey("users.user_id"),          nullable=False),
        sa.Column("category",     sa.String(100), nullable=False),
        sa.Column("amount",       sa.Numeric(12, 2), nullable=False),
        sa.Column("description",  sa.String(500), nullable=True),
        sa.Column("expense_date", sa.Date(),      nullable=False, server_default=sa.func.current_date()),
        sa.Column("created_at",   sa.DateTime(),  nullable=False, server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table("expenses")