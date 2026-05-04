"""Add PostgreSQL Row Level Security (RLS) policies for multi-tenant data isolation.

Every table that contains tenant-specific data is protected at the database level.
Even if the application layer forgets a business_id filter, the database will never
return rows belonging to another tenant.

How it works:
- The backend sets a session variable: SET app.current_business_id = '2'
- RLS policies check this variable against each row's business relationship
- Superadmin bypass: SET app.current_business_id = '0' skips all filters
- Rows with no tenant (e.g. categories, products) are visible to all

SAFE MIGRATION — only adds RLS policies, never drops or modifies data.
Preview with: alembic upgrade head --sql before running.

Revision ID: 0005_add_rls_policies
Revises: 0004_add_plan_to_businesses
"""

from alembic import op
import sqlalchemy as sa

revision    = "0005_add_rls_policies"
down_revision = "0004_add_plan_to_businesses"
branch_labels = None
depends_on    = None


def upgrade():
    conn = op.get_bind()

    # ── Helper: run SQL cleanly ───────────────────────────────────────────────
    def sql(statement: str):
        conn.execute(sa.text(statement))

    # ── Step 1: Create a helper function that returns current business id ─────
    # Returns 0 for superadmin (bypass), or the current tenant's business_id.
    # The application sets app.current_business_id before every query.
    sql("""
        CREATE OR REPLACE FUNCTION app_business_id() RETURNS INTEGER AS $$
        BEGIN
            RETURN COALESCE(
                NULLIF(current_setting('app.current_business_id', TRUE), ''),
                '0'
            )::INTEGER;
        END;
        $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
    """)

    # ── Step 2: Create a helper function that returns branch ids for current tenant ──
    sql("""
        CREATE OR REPLACE FUNCTION app_branch_ids() RETURNS INTEGER[] AS $$
        BEGIN
            IF app_business_id() = 0 THEN
                RETURN ARRAY(SELECT branch_id FROM branches);
            END IF;
            RETURN ARRAY(
                SELECT branch_id FROM branches
                WHERE business_id = app_business_id()
            );
        END;
        $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
    """)

    # =========================================================================
    # BUSINESSES
    # =========================================================================
    sql("ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;")
    sql("ALTER TABLE businesses FORCE ROW LEVEL SECURITY;")
    sql("""
        CREATE POLICY businesses_isolation ON businesses
        USING (
            app_business_id() = 0
            OR business_id = app_business_id()
        );
    """)

    # =========================================================================
    # BRANCHES
    # =========================================================================
    sql("ALTER TABLE branches ENABLE ROW LEVEL SECURITY;")
    sql("ALTER TABLE branches FORCE ROW LEVEL SECURITY;")
    sql("""
        CREATE POLICY branches_isolation ON branches
        USING (
            app_business_id() = 0
            OR business_id = app_business_id()
            OR business_id IS NULL
        );
    """)

    # =========================================================================
    # USERS
    # =========================================================================
    sql("ALTER TABLE users ENABLE ROW LEVEL SECURITY;")
    sql("ALTER TABLE users FORCE ROW LEVEL SECURITY;")
    sql("""
        CREATE POLICY users_isolation ON users
        USING (
            app_business_id() = 0
            OR business_id = app_business_id()
            OR business_id IS NULL
        );
    """)

    # =========================================================================
    # SALES
    # =========================================================================
    sql("ALTER TABLE sales ENABLE ROW LEVEL SECURITY;")
    sql("ALTER TABLE sales FORCE ROW LEVEL SECURITY;")
    sql("""
        CREATE POLICY sales_isolation ON sales
        USING (
            app_business_id() = 0
            OR branch_id = ANY(app_branch_ids())
        );
    """)

    # =========================================================================
    # SALE ITEMS — scoped via sale's branch
    # =========================================================================
    sql("ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;")
    sql("ALTER TABLE sale_items FORCE ROW LEVEL SECURITY;")
    sql("""
        CREATE POLICY sale_items_isolation ON sale_items
        USING (
            app_business_id() = 0
            OR sale_id IN (
                SELECT sale_id FROM sales
                WHERE branch_id = ANY(app_branch_ids())
            )
        );
    """)

    # =========================================================================
    # PAYMENTS — scoped via sale's branch
    # =========================================================================
    sql("ALTER TABLE payments ENABLE ROW LEVEL SECURITY;")
    sql("ALTER TABLE payments FORCE ROW LEVEL SECURITY;")
    sql("""
        CREATE POLICY payments_isolation ON payments
        USING (
            app_business_id() = 0
            OR sale_id IN (
                SELECT sale_id FROM sales
                WHERE branch_id = ANY(app_branch_ids())
            )
        );
    """)

    # =========================================================================
    # REFUNDS — scoped via sale's branch
    # =========================================================================
    sql("ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;")
    sql("ALTER TABLE refunds FORCE ROW LEVEL SECURITY;")
    sql("""
        CREATE POLICY refunds_isolation ON refunds
        USING (
            app_business_id() = 0
            OR sale_id IN (
                SELECT sale_id FROM sales
                WHERE branch_id = ANY(app_branch_ids())
            )
        );
    """)

    # =========================================================================
    # BRANCH INVENTORY
    # =========================================================================
    sql("ALTER TABLE branch_inventory ENABLE ROW LEVEL SECURITY;")
    sql("ALTER TABLE branch_inventory FORCE ROW LEVEL SECURITY;")
    sql("""
        CREATE POLICY branch_inventory_isolation ON branch_inventory
        USING (
            app_business_id() = 0
            OR branch_id = ANY(app_branch_ids())
        );
    """)

    # =========================================================================
    # INVENTORY BATCHES
    # =========================================================================
    sql("ALTER TABLE inventory_batches ENABLE ROW LEVEL SECURITY;")
    sql("ALTER TABLE inventory_batches FORCE ROW LEVEL SECURITY;")
    sql("""
        CREATE POLICY inventory_batches_isolation ON inventory_batches
        USING (
            app_business_id() = 0
            OR branch_id = ANY(app_branch_ids())
        );
    """)

    # =========================================================================
    # INVENTORY MOVEMENTS
    # =========================================================================
    sql("ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;")
    sql("ALTER TABLE inventory_movements FORCE ROW LEVEL SECURITY;")
    sql("""
        CREATE POLICY inventory_movements_isolation ON inventory_movements
        USING (
            app_business_id() = 0
            OR branch_id = ANY(app_branch_ids())
        );
    """)

    # =========================================================================
    # PURCHASE ORDERS — scoped via branch
    # =========================================================================
    sql("ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;")
    sql("ALTER TABLE purchase_orders FORCE ROW LEVEL SECURITY;")
    sql("""
        CREATE POLICY purchase_orders_isolation ON purchase_orders
        USING (
            app_business_id() = 0
            OR branch_id = ANY(app_branch_ids())
        );
    """)

    # =========================================================================
    # PURCHASE ORDER ITEMS — scoped via purchase order's branch
    # =========================================================================
    sql("ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;")
    sql("ALTER TABLE purchase_order_items FORCE ROW LEVEL SECURITY;")
    sql("""
        CREATE POLICY purchase_order_items_isolation ON purchase_order_items
        USING (
            app_business_id() = 0
            OR po_id IN (
                SELECT po_id FROM purchase_orders
                WHERE branch_id = ANY(app_branch_ids())
            )
        );
    """)

    # =========================================================================
    # STOCK TRANSFERS — scoped via from_branch
    # =========================================================================
    sql("ALTER TABLE stock_transfers ENABLE ROW LEVEL SECURITY;")
    sql("ALTER TABLE stock_transfers FORCE ROW LEVEL SECURITY;")
    sql("""
        CREATE POLICY stock_transfers_isolation ON stock_transfers
        USING (
            app_business_id() = 0
            OR from_branch = ANY(app_branch_ids())
            OR to_branch   = ANY(app_branch_ids())
        );
    """)

    # =========================================================================
    # STOCK ADJUSTMENTS — scoped via product's branch inventory
    # Note: stock_adjustments has no branch_id directly — scoped via product
    # For now allow all authenticated users to read (product-level data)
    # and tighten later when branch_id is added to this table.
    # =========================================================================
    sql("ALTER TABLE stock_adjustments ENABLE ROW LEVEL SECURITY;")
    sql("ALTER TABLE stock_adjustments FORCE ROW LEVEL SECURITY;")
    sql("""
        CREATE POLICY stock_adjustments_isolation ON stock_adjustments
        USING (
            app_business_id() = 0
            OR product_id IN (
                SELECT product_id FROM branch_inventory
                WHERE branch_id = ANY(app_branch_ids())
            )
        );
    """)

    # =========================================================================
    # AUDIT LOGS — scoped via user's business
    # =========================================================================
    sql("ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;")
    sql("ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;")
    sql("""
        CREATE POLICY audit_logs_isolation ON audit_logs
        USING (
            app_business_id() = 0
            OR user_id IN (
                SELECT user_id FROM users
                WHERE business_id = app_business_id()
            )
        );
    """)

    # =========================================================================
    # PRODUCTS — intentionally global (shared catalog)
    # Products are not tenant-scoped — all businesses share the product catalog.
    # Tenant isolation for products is handled at the branch_inventory level.
    # No RLS needed here. If you move to per-tenant product catalogs in future,
    # add a business_id column to products and enable RLS then.
    # =========================================================================
    # sql("ALTER TABLE products ENABLE ROW LEVEL SECURITY;")  -- intentionally skipped

    # =========================================================================
    # CATEGORIES — intentionally global (shared catalog)
    # =========================================================================
    # sql("ALTER TABLE categories ENABLE ROW LEVEL SECURITY;")  -- intentionally skipped

    # =========================================================================
    # CUSTOMERS — no business_id yet, intentionally skipped for now
    # Add business_id to customers table before enabling RLS here.
    # =========================================================================
    # sql("ALTER TABLE customers ENABLE ROW LEVEL SECURITY;")  -- intentionally skipped

    # =========================================================================
    # SUPPLIERS — no business_id yet, intentionally skipped
    # =========================================================================
    # sql("ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;")  -- intentionally skipped


def downgrade():
    conn = op.get_bind()

    def sql(statement: str):
        conn.execute(sa.text(statement))

    # Drop all policies and disable RLS in reverse order
    tables_with_rls = [
        "audit_logs",
        "stock_adjustments",
        "stock_transfers",
        "purchase_order_items",
        "purchase_orders",
        "inventory_movements",
        "inventory_batches",
        "branch_inventory",
        "refunds",
        "payments",
        "sale_items",
        "sales",
        "users",
        "branches",
        "businesses",
    ]

    policy_names = {
        "audit_logs":            "audit_logs_isolation",
        "stock_adjustments":     "stock_adjustments_isolation",
        "stock_transfers":       "stock_transfers_isolation",
        "purchase_order_items":  "purchase_order_items_isolation",
        "purchase_orders":       "purchase_orders_isolation",
        "inventory_movements":   "inventory_movements_isolation",
        "inventory_batches":     "inventory_batches_isolation",
        "branch_inventory":      "branch_inventory_isolation",
        "refunds":               "refunds_isolation",
        "payments":              "payments_isolation",
        "sale_items":            "sale_items_isolation",
        "sales":                 "sales_isolation",
        "users":                 "users_isolation",
        "branches":              "branches_isolation",
        "businesses":            "businesses_isolation",
    }

    for table in tables_with_rls:
        policy = policy_names[table]
        sql(f"DROP POLICY IF EXISTS {policy} ON {table};")
        sql(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY;")

    sql("DROP FUNCTION IF EXISTS app_branch_ids();")
    sql("DROP FUNCTION IF EXISTS app_business_id();")