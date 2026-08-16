"""Add item-level partial-refund ledger and database quantity guard.

Revision ID: 0019_add_partial_refund_ledger
Revises: 0018_add_report_hour
"""

from alembic import op
import sqlalchemy as sa


revision = "0019_add_partial_refund_ledger"
down_revision = "0018_add_report_hour"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("refunds", sa.Column("user_id", sa.Integer(), nullable=True))
    op.add_column("refunds", sa.Column("branch_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_refunds_user_id", "refunds", "users", ["user_id"], ["user_id"])
    op.create_foreign_key("fk_refunds_branch_id", "refunds", "branches", ["branch_id"], ["branch_id"])
    op.create_index("ix_refunds_sale_id", "refunds", ["sale_id"])

    op.create_table(
        "refund_items",
        sa.Column("refund_item_id", sa.Integer(), primary_key=True),
        sa.Column("refund_id", sa.Integer(), nullable=False),
        sa.Column("sale_item_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.CheckConstraint("quantity > 0", name="ck_refund_items_quantity_positive"),
        sa.UniqueConstraint("refund_id", "sale_item_id", name="uq_refund_item_per_refund"),
        sa.ForeignKeyConstraint(["refund_id"], ["refunds.refund_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["sale_item_id"], ["sale_items.sale_item_id"]),
        sa.ForeignKeyConstraint(["product_id"], ["products.product_id"]),
    )
    op.create_index("ix_refund_items_refund_id", "refund_items", ["refund_id"])
    op.create_index("ix_refund_items_sale_item_id", "refund_items", ["sale_item_id"])

    op.execute("ALTER TABLE refund_items ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE refund_items FORCE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY refund_items_isolation ON refund_items
        USING (
            app_business_id() = 0
            OR refund_id IN (
                SELECT r.refund_id
                FROM refunds r
                JOIN sales s ON s.sale_id = r.sale_id
                WHERE s.branch_id = ANY(app_branch_ids())
            )
        )
    """)

    # This trigger is the database backstop. It serializes by sale and rejects
    # any writer—not only this API—that would cumulatively refund more units
    # than were sold or attach an item to the wrong sale.
    op.execute("""
        CREATE OR REPLACE FUNCTION enforce_refund_item_quantity() RETURNS trigger AS $$
        DECLARE
            sold_quantity integer;
            target_sale_id integer;
            item_sale_id integer;
            already_refunded bigint;
        BEGIN
            SELECT sale_id INTO target_sale_id
            FROM refunds WHERE refund_id = NEW.refund_id;

            SELECT sale_id, quantity INTO item_sale_id, sold_quantity
            FROM sale_items WHERE sale_item_id = NEW.sale_item_id;

            IF target_sale_id IS NULL OR item_sale_id IS NULL OR target_sale_id <> item_sale_id THEN
                RAISE EXCEPTION 'refund item does not belong to refund sale'
                    USING ERRCODE = '23514';
            END IF;

            PERFORM 1 FROM sales WHERE sale_id = target_sale_id FOR UPDATE;

            SELECT COALESCE(SUM(ri.quantity), 0) INTO already_refunded
            FROM refund_items ri
            JOIN refunds r ON r.refund_id = ri.refund_id
            WHERE r.sale_id = target_sale_id
              AND ri.sale_item_id = NEW.sale_item_id;

            IF NEW.quantity <= 0 OR already_refunded + NEW.quantity > sold_quantity THEN
                RAISE EXCEPTION 'cumulative refund quantity exceeds sold quantity'
                    USING ERRCODE = '23514';
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)
    op.execute("""
        CREATE TRIGGER trg_enforce_refund_item_quantity
        BEFORE INSERT ON refund_items
        FOR EACH ROW EXECUTE FUNCTION enforce_refund_item_quantity()
    """)
    op.execute("""
        CREATE FUNCTION prevent_refund_item_mutation() RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'refund item evidence is immutable'
                USING ERRCODE = '55000';
        END;
        $$ LANGUAGE plpgsql;
    """)
    op.execute("""
        CREATE TRIGGER trg_prevent_refund_item_mutation
        BEFORE UPDATE OR DELETE ON refund_items
        FOR EACH ROW EXECUTE FUNCTION prevent_refund_item_mutation()
    """)


def downgrade():
    op.execute("DROP TRIGGER IF EXISTS trg_prevent_refund_item_mutation ON refund_items")
    op.execute("DROP FUNCTION IF EXISTS prevent_refund_item_mutation()")
    op.execute("DROP TRIGGER IF EXISTS trg_enforce_refund_item_quantity ON refund_items")
    op.execute("DROP FUNCTION IF EXISTS enforce_refund_item_quantity()")
    op.drop_table("refund_items")
    op.drop_index("ix_refunds_sale_id", table_name="refunds")
    op.drop_constraint("fk_refunds_branch_id", "refunds", type_="foreignkey")
    op.drop_constraint("fk_refunds_user_id", "refunds", type_="foreignkey")
    op.drop_column("refunds", "branch_id")
    op.drop_column("refunds", "user_id")
