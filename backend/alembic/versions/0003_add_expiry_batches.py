"""add inventory batches and expiry tracking

Revision ID: 0003_add_expiry_batches
Revises: 0002_add_businesses
Create Date: 2026-04-30
"""

from alembic import op
import sqlalchemy as sa

revision = "0003_add_expiry_batches"
down_revision = "0002_add_businesses"
branch_labels = None
depends_on = None


def upgrade():
    # ── 1. inventory_batches table ────────────────────────────────────────────
    op.create_table(
        "inventory_batches",
        sa.Column("batch_id",       sa.Integer(),     primary_key=True),
        sa.Column("product_id",     sa.Integer(),     sa.ForeignKey("products.product_id"),          nullable=False),
        sa.Column("branch_id",      sa.Integer(),     sa.ForeignKey("branches.branch_id"),           nullable=False),
        sa.Column("po_id",          sa.Integer(),     sa.ForeignKey("purchase_orders.po_id"),        nullable=True),
        sa.Column("quantity",       sa.Integer(),     nullable=False),
        sa.Column("expiry_date",    sa.Date(),        nullable=True),
        sa.Column("received_date",  sa.Date(),        server_default=sa.func.current_date()),
        sa.Column("notes",          sa.String(),      nullable=True),
        sa.Column("created_at",     sa.DateTime(),    server_default=sa.func.now()),
    )

    # ── 2. expiry_date on purchase_order_items ────────────────────────────────
    op.add_column("purchase_order_items",
        sa.Column("expiry_date", sa.Date(), nullable=True)
    )

    # ── 3. expiry_alert_days on branch_inventory (per-branch threshold) ───────
    op.add_column("branch_inventory",
        sa.Column("expiry_alert_days", sa.Integer(), server_default="90", nullable=False)
    )


def downgrade():
    op.drop_column("branch_inventory", "expiry_alert_days")
    op.drop_column("purchase_order_items", "expiry_date")
    op.drop_table("inventory_batches")