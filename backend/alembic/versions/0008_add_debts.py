"""Add debts and debt_payments tables for customer credit tracking.

Debts track what customers owe the business.
Debt payments track individual payments made against a debt.

SAFE MIGRATION — only adds new tables.
Preview with: alembic upgrade head --sql before running.

Revision ID: 0008_add_debts
Revises: 0007_add_expenses
"""

from alembic import op
import sqlalchemy as sa

revision      = "0008_add_debts"
down_revision = "0007_add_expenses"
branch_labels = None
depends_on    = None


def upgrade():
    # ── debts ─────────────────────────────────────────────────────────────────
    op.create_table(
        "debts",
        sa.Column("debt_id",      sa.Integer,        primary_key=True, index=True),
        sa.Column("business_id",  sa.Integer,        sa.ForeignKey("businesses.business_id"), nullable=False, index=True),
        sa.Column("branch_id",    sa.Integer,        sa.ForeignKey("branches.branch_id"),     nullable=False),
        sa.Column("customer_id",  sa.Integer,        sa.ForeignKey("customers.customer_id"),  nullable=False, index=True),
        sa.Column("user_id",      sa.Integer,        sa.ForeignKey("users.user_id"),          nullable=False),
        sa.Column("sale_id",      sa.Integer,        sa.ForeignKey("sales.sale_id"),          nullable=True),
        sa.Column("total_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("amount_paid",  sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("balance",      sa.Numeric(12, 2), nullable=False),
        sa.Column("description",  sa.String(500),    nullable=True),
        sa.Column("due_date",     sa.Date(),         nullable=True),
        sa.Column("status",       sa.String(20),     nullable=False, server_default="open"),
        # status: open | partial | paid | written_off
        sa.Column("created_at",   sa.DateTime(),     nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at",   sa.DateTime(),     nullable=False, server_default=sa.func.now()),
    )

    # ── debt_payments ─────────────────────────────────────────────────────────
    op.create_table(
        "debt_payments",
        sa.Column("payment_id",     sa.Integer,        primary_key=True, index=True),
        sa.Column("debt_id",        sa.Integer,        sa.ForeignKey("debts.debt_id"), nullable=False, index=True),
        sa.Column("user_id",        sa.Integer,        sa.ForeignKey("users.user_id"), nullable=False),
        sa.Column("amount",         sa.Numeric(12, 2), nullable=False),
        sa.Column("payment_method", sa.String(50),     nullable=False, server_default="cash"),
        sa.Column("notes",          sa.String(500),    nullable=True),
        sa.Column("created_at",     sa.DateTime(),     nullable=False, server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table("debt_payments")
    op.drop_table("debts")