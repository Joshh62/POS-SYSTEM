"""add inter-branch stock transfer ledger and inventory traceability

Revision ID: 0023_stock_transfer_guard
Revises: 0022_receivables_ledger_guard
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "0023_stock_transfer_guard"
down_revision = "0022_receivables_ledger_guard"
branch_labels = None
depends_on = None


def _column_names(bind, table):
    return {column["name"] for column in inspect(bind).get_columns(table)}


def upgrade():
    bind = op.get_bind()
    columns = _column_names(bind, "stock_transfers")

    additions = {
        "business_id": sa.Column("business_id", sa.Integer(), nullable=True),
        "user_id": sa.Column("user_id", sa.Integer(), nullable=True),
        "idempotency_key": sa.Column("idempotency_key", sa.String(100), nullable=True),
        "status": sa.Column("status", sa.String(20), nullable=True),
        "notes": sa.Column("notes", sa.String(500), nullable=True),
    }
    for name, column in additions.items():
        if name not in columns:
            op.add_column("stock_transfers", column)

    op.create_foreign_key(
        "fk_stock_transfers_business_id",
        "stock_transfers", "businesses", ["business_id"], ["business_id"],
    )
    op.create_foreign_key(
        "fk_stock_transfers_user_id",
        "stock_transfers", "users", ["user_id"], ["user_id"],
    )
    op.create_index("ix_stock_transfers_business_id", "stock_transfers", ["business_id"])
    op.create_index("ix_stock_transfers_from_branch", "stock_transfers", ["from_branch"])
    op.create_index("ix_stock_transfers_to_branch", "stock_transfers", ["to_branch"])
    op.create_index("ix_stock_transfers_user_id", "stock_transfers", ["user_id"])
    op.create_index(
        "ux_stock_transfers_business_idempotency",
        "stock_transfers",
        ["business_id", "idempotency_key"],
        unique=True,
        postgresql_where=sa.text("idempotency_key IS NOT NULL"),
    )
    op.execute(
        """
        ALTER TABLE stock_transfers
        ADD CONSTRAINT ck_stock_transfers_new_evidence_complete
        CHECK (
          business_id IS NOT NULL AND user_id IS NOT NULL
          AND from_branch IS NOT NULL AND to_branch IS NOT NULL
          AND from_branch <> to_branch
          AND idempotency_key IS NOT NULL AND length(trim(idempotency_key)) > 0
          AND status = 'completed'
        ) NOT VALID
        """
    )

    op.create_table(
        "stock_transfer_items",
        sa.Column("transfer_item_id", sa.Integer(), primary_key=True),
        sa.Column(
            "transfer_id", sa.Integer(),
            sa.ForeignKey("stock_transfers.transfer_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.product_id"), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("source_before", sa.Integer(), nullable=False),
        sa.Column("source_after", sa.Integer(), nullable=False),
        sa.Column("destination_before", sa.Integer(), nullable=False),
        sa.Column("destination_after", sa.Integer(), nullable=False),
        sa.UniqueConstraint("transfer_id", "product_id", name="uq_stock_transfer_item_product"),
        sa.CheckConstraint("quantity > 0", name="ck_stock_transfer_items_positive_quantity"),
        sa.CheckConstraint(
            "source_before >= 0 AND source_after >= 0 "
            "AND destination_before >= 0 AND destination_after >= 0",
            name="ck_stock_transfer_items_nonnegative_snapshots",
        ),
        sa.CheckConstraint(
            "source_after = source_before - quantity",
            name="ck_stock_transfer_items_exact_source",
        ),
        sa.CheckConstraint(
            "destination_after = destination_before + quantity",
            name="ck_stock_transfer_items_exact_destination",
        ),
    )
    op.create_index("ix_stock_transfer_items_transfer_id", "stock_transfer_items", ["transfer_id"])
    op.create_index("ix_stock_transfer_items_product_id", "stock_transfer_items", ["product_id"])

    movement_columns = _column_names(bind, "inventory_movements")
    if "stock_transfer_id" not in movement_columns:
        op.add_column("inventory_movements", sa.Column("stock_transfer_id", sa.Integer(), nullable=True))
    if "stock_transfer_item_id" not in movement_columns:
        op.add_column("inventory_movements", sa.Column("stock_transfer_item_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_inventory_movements_stock_transfer",
        "inventory_movements", "stock_transfers",
        ["stock_transfer_id"], ["transfer_id"],
    )
    op.create_foreign_key(
        "fk_inventory_movements_stock_transfer_item",
        "inventory_movements", "stock_transfer_items",
        ["stock_transfer_item_id"], ["transfer_item_id"],
    )
    op.create_index("ix_inventory_movements_stock_transfer_id", "inventory_movements", ["stock_transfer_id"])
    op.create_index(
        "ix_inventory_movements_stock_transfer_item_id",
        "inventory_movements",
        ["stock_transfer_item_id"],
    )
    op.execute(
        """
        ALTER TABLE inventory_movements
        ADD CONSTRAINT ck_inventory_movements_transfer_evidence
        CHECK (
          movement_type NOT IN ('TRANSFER_OUT', 'TRANSFER_IN')
          OR (
            stock_transfer_id IS NOT NULL AND stock_transfer_item_id IS NOT NULL
            AND (
              (movement_type = 'TRANSFER_OUT' AND quantity < 0)
              OR (movement_type = 'TRANSFER_IN' AND quantity > 0)
            )
          )
        ) NOT VALID
        """
    )


def downgrade():
    op.drop_constraint("ck_inventory_movements_transfer_evidence", "inventory_movements", type_="check")
    op.drop_index("ix_inventory_movements_stock_transfer_item_id", table_name="inventory_movements")
    op.drop_index("ix_inventory_movements_stock_transfer_id", table_name="inventory_movements")
    op.drop_constraint(
        "fk_inventory_movements_stock_transfer_item", "inventory_movements", type_="foreignkey"
    )
    op.drop_constraint(
        "fk_inventory_movements_stock_transfer", "inventory_movements", type_="foreignkey"
    )
    op.drop_column("inventory_movements", "stock_transfer_item_id")
    op.drop_column("inventory_movements", "stock_transfer_id")
    op.drop_table("stock_transfer_items")
    op.drop_constraint("ck_stock_transfers_new_evidence_complete", "stock_transfers", type_="check")
    op.drop_index("ux_stock_transfers_business_idempotency", table_name="stock_transfers")
    op.drop_index("ix_stock_transfers_user_id", table_name="stock_transfers")
    op.drop_index("ix_stock_transfers_to_branch", table_name="stock_transfers")
    op.drop_index("ix_stock_transfers_from_branch", table_name="stock_transfers")
    op.drop_index("ix_stock_transfers_business_id", table_name="stock_transfers")
    op.drop_constraint("fk_stock_transfers_user_id", "stock_transfers", type_="foreignkey")
    op.drop_constraint("fk_stock_transfers_business_id", "stock_transfers", type_="foreignkey")
    op.drop_column("stock_transfers", "notes")
    op.drop_column("stock_transfers", "status")
    op.drop_column("stock_transfers", "idempotency_key")
    op.drop_column("stock_transfers", "user_id")
    op.drop_column("stock_transfers", "business_id")
