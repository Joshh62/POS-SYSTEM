"""add manual inventory adjustment and restock assurance

Revision ID: 0021_add_inventory_adjustment_assurance
Revises: 0020_add_purchase_receipt_ledger
Create Date: 2026-08-16
"""
from alembic import op
import sqlalchemy as sa


revision = "0021_add_inventory_adjustment_assurance"
down_revision = "0020_add_purchase_receipt_ledger"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("stock_adjustments", sa.Column("branch_id", sa.Integer(), nullable=True))
    op.add_column("stock_adjustments", sa.Column("user_id", sa.Integer(), nullable=True))
    op.add_column("stock_adjustments", sa.Column("before_quantity", sa.Integer(), nullable=True))
    op.add_column("stock_adjustments", sa.Column("after_quantity", sa.Integer(), nullable=True))
    op.create_index("ix_stock_adjustments_branch_id", "stock_adjustments", ["branch_id"])
    op.create_index("ix_stock_adjustments_user_id", "stock_adjustments", ["user_id"])
    op.create_foreign_key(
        "fk_stock_adjustments_branch_id",
        "stock_adjustments", "branches",
        ["branch_id"], ["branch_id"],
    )
    op.create_foreign_key(
        "fk_stock_adjustments_user_id",
        "stock_adjustments", "users",
        ["user_id"], ["user_id"],
    )

    # NOT VALID avoids inventing a claim that historical production rows have
    # already been reconciled. PostgreSQL still enforces each constraint for
    # every new or updated row after this migration is applied.
    op.execute(
        """
        ALTER TABLE branch_inventory
        ADD CONSTRAINT ck_branch_inventory_nonnegative_stock
        CHECK (stock_quantity >= 0) NOT VALID
        """
    )
    op.execute(
        """
        ALTER TABLE stock_adjustments
        ADD CONSTRAINT ck_stock_adjustments_nonzero_quantity
        CHECK (quantity <> 0) NOT VALID
        """
    )
    op.execute(
        """
        ALTER TABLE stock_adjustments
        ADD CONSTRAINT ck_stock_adjustments_nonnegative_before
        CHECK (before_quantity IS NULL OR before_quantity >= 0) NOT VALID
        """
    )
    op.execute(
        """
        ALTER TABLE stock_adjustments
        ADD CONSTRAINT ck_stock_adjustments_nonnegative_after
        CHECK (after_quantity IS NULL OR after_quantity >= 0) NOT VALID
        """
    )
    op.execute(
        """
        ALTER TABLE stock_adjustments
        ADD CONSTRAINT ck_stock_adjustments_evidence_complete
        CHECK (
            branch_id IS NOT NULL
            AND user_id IS NOT NULL
            AND before_quantity IS NOT NULL
            AND after_quantity IS NOT NULL
            AND reason IS NOT NULL
            AND length(btrim(reason)) > 0
        ) NOT VALID
        """
    )


def downgrade():
    op.drop_constraint(
        "ck_stock_adjustments_evidence_complete",
        "stock_adjustments", type_="check",
    )
    op.drop_constraint(
        "ck_stock_adjustments_nonnegative_after",
        "stock_adjustments", type_="check",
    )
    op.drop_constraint(
        "ck_stock_adjustments_nonnegative_before",
        "stock_adjustments", type_="check",
    )
    op.drop_constraint(
        "ck_stock_adjustments_nonzero_quantity",
        "stock_adjustments", type_="check",
    )
    op.drop_constraint(
        "ck_branch_inventory_nonnegative_stock",
        "branch_inventory", type_="check",
    )

    op.drop_constraint(
        "fk_stock_adjustments_user_id",
        "stock_adjustments", type_="foreignkey",
    )
    op.drop_constraint(
        "fk_stock_adjustments_branch_id",
        "stock_adjustments", type_="foreignkey",
    )
    op.drop_index("ix_stock_adjustments_user_id", table_name="stock_adjustments")
    op.drop_index("ix_stock_adjustments_branch_id", table_name="stock_adjustments")
    op.drop_column("stock_adjustments", "after_quantity")
    op.drop_column("stock_adjustments", "before_quantity")
    op.drop_column("stock_adjustments", "user_id")
    op.drop_column("stock_adjustments", "branch_id")
