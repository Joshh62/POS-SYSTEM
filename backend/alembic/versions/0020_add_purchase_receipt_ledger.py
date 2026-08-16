"""add purchase receipt ledger and inventory traceability

Revision ID: 0020_add_purchase_receipt_ledger
Revises: 0019_add_partial_refund_ledger
Create Date: 2026-08-16
"""
from alembic import op
import sqlalchemy as sa


revision = "0020_add_purchase_receipt_ledger"
down_revision = "0019_add_partial_refund_ledger"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("purchase_orders", sa.Column("business_id", sa.Integer(), nullable=True))
    op.create_index("ix_purchase_orders_business_id", "purchase_orders", ["business_id"])
    op.create_foreign_key(
        "fk_purchase_orders_business_id",
        "purchase_orders", "businesses",
        ["business_id"], ["business_id"],
    )
    op.execute(
        """
        UPDATE purchase_orders po
        SET business_id = b.business_id
        FROM branches b
        WHERE b.branch_id = po.branch_id
          AND po.business_id IS NULL
        """
    )

    op.alter_column("purchase_orders", "supplier_id", existing_type=sa.Integer(), nullable=False)
    op.alter_column("purchase_orders", "branch_id", existing_type=sa.Integer(), nullable=False)
    op.alter_column("purchase_orders", "status", existing_type=sa.String(), nullable=False)

    op.alter_column("purchase_order_items", "po_id", existing_type=sa.Integer(), nullable=False)
    op.alter_column("purchase_order_items", "product_id", existing_type=sa.Integer(), nullable=False)
    op.alter_column("purchase_order_items", "quantity", existing_type=sa.Integer(), nullable=False)
    op.alter_column("purchase_order_items", "unit_cost", existing_type=sa.Numeric(12, 2), nullable=False)
    op.create_check_constraint(
        "ck_purchase_order_items_quantity_positive",
        "purchase_order_items", "quantity > 0",
    )
    op.create_check_constraint(
        "ck_purchase_order_items_unit_cost_positive",
        "purchase_order_items", "unit_cost > 0",
    )
    op.create_unique_constraint(
        "uq_purchase_order_item_product",
        "purchase_order_items", ["po_id", "product_id"],
    )

    op.create_table(
        "purchase_receipts",
        sa.Column("receipt_id", sa.Integer(), primary_key=True),
        sa.Column("po_id", sa.Integer(), nullable=False),
        sa.Column("business_id", sa.Integer(), nullable=False),
        sa.Column("branch_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("received_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("notes", sa.String(500), nullable=True),
        sa.ForeignKeyConstraint(["po_id"], ["purchase_orders.po_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.business_id"]),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.branch_id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.user_id"]),
    )
    op.create_index("ix_purchase_receipts_po_id", "purchase_receipts", ["po_id"])
    op.create_index("ix_purchase_receipts_business_id", "purchase_receipts", ["business_id"])

    op.create_table(
        "purchase_receipt_items",
        sa.Column("receipt_item_id", sa.Integer(), primary_key=True),
        sa.Column("receipt_id", sa.Integer(), nullable=False),
        sa.Column("po_item_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_cost", sa.Numeric(12, 2), nullable=False),
        sa.Column("expiry_date", sa.Date(), nullable=True),
        sa.CheckConstraint("quantity > 0", name="ck_purchase_receipt_items_quantity_positive"),
        sa.CheckConstraint("unit_cost > 0", name="ck_purchase_receipt_items_unit_cost_positive"),
        sa.ForeignKeyConstraint(["receipt_id"], ["purchase_receipts.receipt_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["po_item_id"], ["purchase_order_items.po_item_id"]),
        sa.ForeignKeyConstraint(["product_id"], ["products.product_id"]),
        sa.UniqueConstraint("receipt_id", "po_item_id", name="uq_purchase_receipt_item_per_receipt"),
    )
    op.create_index("ix_purchase_receipt_items_receipt_id", "purchase_receipt_items", ["receipt_id"])
    op.create_index("ix_purchase_receipt_items_po_item_id", "purchase_receipt_items", ["po_item_id"])

    op.add_column("inventory_batches", sa.Column("receipt_id", sa.Integer(), nullable=True))
    op.create_index("ix_inventory_batches_receipt_id", "inventory_batches", ["receipt_id"])
    op.create_foreign_key(
        "fk_inventory_batches_receipt_id",
        "inventory_batches", "purchase_receipts",
        ["receipt_id"], ["receipt_id"],
    )

    op.add_column("inventory_movements", sa.Column("purchase_receipt_id", sa.Integer(), nullable=True))
    op.create_index(
        "ix_inventory_movements_purchase_receipt_id",
        "inventory_movements", ["purchase_receipt_id"],
    )
    op.create_foreign_key(
        "fk_inventory_movements_purchase_receipt_id",
        "inventory_movements", "purchase_receipts",
        ["purchase_receipt_id"], ["receipt_id"],
    )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION enforce_purchase_receipt_quantity()
        RETURNS trigger AS $$
        DECLARE
          target_po integer;
          item_po integer;
          item_product integer;
          ordered integer;
          prior bigint;
          receipt_business integer;
          receipt_branch integer;
          po_business integer;
          po_branch integer;
        BEGIN
          SELECT po_id, business_id, branch_id
          INTO target_po, receipt_business, receipt_branch
          FROM purchase_receipts
          WHERE receipt_id = NEW.receipt_id;

          SELECT po_id, product_id, quantity
          INTO item_po, item_product, ordered
          FROM purchase_order_items
          WHERE po_item_id = NEW.po_item_id;

          IF target_po IS NULL OR item_po IS NULL OR target_po <> item_po
             OR NEW.product_id <> item_product THEN
            RAISE EXCEPTION 'receipt item does not belong to purchase order'
              USING ERRCODE = '23514';
          END IF;

          SELECT business_id, branch_id
          INTO po_business, po_branch
          FROM purchase_orders
          WHERE po_id = target_po
          FOR UPDATE;

          IF receipt_business <> po_business OR receipt_branch <> po_branch THEN
            RAISE EXCEPTION 'receipt scope does not match purchase order'
              USING ERRCODE = '23514';
          END IF;

          SELECT COALESCE(SUM(pri.quantity), 0)
          INTO prior
          FROM purchase_receipt_items pri
          JOIN purchase_receipts pr ON pr.receipt_id = pri.receipt_id
          WHERE pr.po_id = target_po
            AND pri.po_item_id = NEW.po_item_id
            AND pri.receipt_item_id <> COALESCE(NEW.receipt_item_id, 0);

          IF NEW.quantity <= 0 OR prior + NEW.quantity > ordered THEN
            RAISE EXCEPTION 'cumulative receipt quantity exceeds ordered quantity'
              USING ERRCODE = '23514';
          END IF;

          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER trg_enforce_purchase_receipt_quantity
        BEFORE INSERT OR UPDATE ON purchase_receipt_items
        FOR EACH ROW EXECUTE FUNCTION enforce_purchase_receipt_quantity();
        """
    )


def downgrade():
    op.execute("DROP TRIGGER IF EXISTS trg_enforce_purchase_receipt_quantity ON purchase_receipt_items")
    op.execute("DROP FUNCTION IF EXISTS enforce_purchase_receipt_quantity")

    op.drop_constraint(
        "fk_inventory_movements_purchase_receipt_id",
        "inventory_movements", type_="foreignkey",
    )
    op.drop_index("ix_inventory_movements_purchase_receipt_id", table_name="inventory_movements")
    op.drop_column("inventory_movements", "purchase_receipt_id")

    op.drop_constraint(
        "fk_inventory_batches_receipt_id",
        "inventory_batches", type_="foreignkey",
    )
    op.drop_index("ix_inventory_batches_receipt_id", table_name="inventory_batches")
    op.drop_column("inventory_batches", "receipt_id")

    op.drop_table("purchase_receipt_items")
    op.drop_table("purchase_receipts")

    op.drop_constraint("uq_purchase_order_item_product", "purchase_order_items", type_="unique")
    op.drop_constraint(
        "ck_purchase_order_items_unit_cost_positive",
        "purchase_order_items", type_="check",
    )
    op.drop_constraint(
        "ck_purchase_order_items_quantity_positive",
        "purchase_order_items", type_="check",
    )

    op.drop_constraint("fk_purchase_orders_business_id", "purchase_orders", type_="foreignkey")
    op.drop_index("ix_purchase_orders_business_id", table_name="purchase_orders")
    op.drop_column("purchase_orders", "business_id")
