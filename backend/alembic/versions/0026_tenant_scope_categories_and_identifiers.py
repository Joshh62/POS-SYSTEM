"""tenant-scope categories and reusable business identifiers

Revision ID: 0026_tenant_scope_categories
Revises: 0025_expense_ledger_guard
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "0026_tenant_scope_categories"
down_revision = "0025_expense_ledger_guard"
branch_labels = None
depends_on = None


def _drop_single_column_unique(bind, table, column):
    for constraint in inspect(bind).get_unique_constraints(table):
        if constraint.get("column_names") == [column] and constraint.get("name"):
            op.drop_constraint(constraint["name"], table, type_="unique")


def upgrade():
    bind = op.get_bind()
    bind.execute(sa.text("SET LOCAL app.current_business_id = '0'"))

    op.add_column(
        "categories",
        sa.Column(
            "business_id",
            sa.Integer(),
            sa.ForeignKey("businesses.business_id"),
            nullable=True,
        ),
    )
    _drop_single_column_unique(bind, "categories", "category_name")

    business_ids = [
        row[0] for row in bind.execute(sa.text(
            "SELECT business_id FROM businesses ORDER BY business_id"
        ))
    ]
    categories = list(bind.execute(sa.text(
        "SELECT category_id, category_name, created_at "
        "FROM categories ORDER BY category_id"
    )))
    if categories and not business_ids:
        raise RuntimeError("Cannot tenant-scope categories without a business")

    for category_id, category_name, created_at in categories:
        owners = [
            row[0] for row in bind.execute(
                sa.text(
                    "SELECT DISTINCT business_id FROM products "
                    "WHERE category_id=:category_id AND business_id IS NOT NULL "
                    "ORDER BY business_id"
                ),
                {"category_id": category_id},
            )
        ]
        owners = owners or business_ids[:1]
        bind.execute(
            sa.text(
                "UPDATE categories SET business_id=:business_id "
                "WHERE category_id=:category_id"
            ),
            {"business_id": owners[0], "category_id": category_id},
        )
        for business_id in owners[1:]:
            cloned_id = bind.execute(
                sa.text(
                    "INSERT INTO categories (business_id, category_name, created_at) "
                    "VALUES (:business_id, :category_name, :created_at) "
                    "RETURNING category_id"
                ),
                {
                    "business_id": business_id,
                    "category_name": category_name,
                    "created_at": created_at,
                },
            ).scalar_one()
            bind.execute(
                sa.text(
                    "UPDATE products SET category_id=:cloned_id "
                    "WHERE category_id=:category_id AND business_id=:business_id"
                ),
                {
                    "cloned_id": cloned_id,
                    "category_id": category_id,
                    "business_id": business_id,
                },
            )

    op.alter_column("categories", "business_id", nullable=False)
    op.create_index("ix_categories_business_id", "categories", ["business_id"])
    op.create_unique_constraint(
        "uq_categories_business_name",
        "categories",
        ["business_id", "category_name"],
    )

    _drop_single_column_unique(bind, "products", "barcode")
    for index in inspect(bind).get_indexes("products"):
        if index.get("column_names") == ["barcode"] and index.get("name"):
            op.drop_index(index["name"], table_name="products")
    op.create_index("ix_products_barcode", "products", ["barcode"])
    op.create_unique_constraint(
        "uq_products_business_barcode",
        "products",
        ["business_id", "barcode"],
    )
    _drop_single_column_unique(bind, "customers", "phone")
    op.create_unique_constraint(
        "uq_customers_business_phone",
        "customers",
        ["business_id", "phone"],
    )

    op.execute("ALTER TABLE categories ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE categories FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY categories_isolation ON categories
        USING (app_business_id() = 0 OR business_id = app_business_id())
        WITH CHECK (app_business_id() = 0 OR business_id = app_business_id())
        """
    )
    for table in ("products", "customers", "suppliers"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(f"DROP POLICY IF EXISTS {table}_isolation ON {table}")
        op.execute(
            f"""
            CREATE POLICY {table}_isolation ON {table}
            USING (app_business_id() = 0 OR business_id = app_business_id())
            WITH CHECK (app_business_id() = 0 OR business_id = app_business_id())
            """
        )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION enforce_product_reference_scope()
        RETURNS trigger AS $$
        DECLARE category_business integer;
        DECLARE supplier_business integer;
        BEGIN
          IF NEW.business_id IS NULL THEN
            RAISE EXCEPTION 'product business_id is required'
              USING ERRCODE='23514';
          END IF;
          IF NEW.category_id IS NOT NULL THEN
            SELECT business_id INTO category_business FROM categories
              WHERE category_id=NEW.category_id;
            IF category_business IS NULL OR category_business<>NEW.business_id THEN
              RAISE EXCEPTION 'product category scope mismatch'
                USING ERRCODE='23514';
            END IF;
          END IF;
          IF NEW.supplier_id IS NOT NULL THEN
            SELECT business_id INTO supplier_business FROM suppliers
              WHERE supplier_id=NEW.supplier_id;
            IF supplier_business IS NULL OR supplier_business<>NEW.business_id THEN
              RAISE EXCEPTION 'product supplier scope mismatch'
                USING ERRCODE='23514';
            END IF;
          END IF;
          RETURN NEW;
        END; $$ LANGUAGE plpgsql;

        CREATE TRIGGER trg_enforce_product_reference_scope
          BEFORE INSERT OR UPDATE OF business_id, category_id, supplier_id
          ON products
          FOR EACH ROW EXECUTE FUNCTION enforce_product_reference_scope()
        """
    )


def downgrade():
    bind = op.get_bind()
    bind.execute(sa.text("SET LOCAL app.current_business_id = '0'"))
    op.execute(
        "DROP TRIGGER IF EXISTS trg_enforce_product_reference_scope ON products"
    )
    op.execute("DROP FUNCTION IF EXISTS enforce_product_reference_scope()")
    for table in ("suppliers", "customers", "products"):
        op.execute(f"DROP POLICY IF EXISTS {table}_isolation ON {table}")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
    op.execute("DROP POLICY IF EXISTS categories_isolation ON categories")
    op.execute("ALTER TABLE categories DISABLE ROW LEVEL SECURITY")
    op.drop_constraint(
        "uq_customers_business_phone", "customers", type_="unique"
    )
    op.create_unique_constraint("customers_phone_key", "customers", ["phone"])
    op.drop_constraint(
        "uq_products_business_barcode", "products", type_="unique"
    )
    op.drop_index("ix_products_barcode", table_name="products")
    op.create_index(
        "ix_products_barcode", "products", ["barcode"], unique=True
    )

    duplicates = list(bind.execute(sa.text(
        "SELECT category_name, min(category_id) AS canonical_id, "
        "array_agg(category_id) AS category_ids "
        "FROM categories GROUP BY category_name HAVING count(*) > 1"
    )))
    for _, canonical_id, category_ids in duplicates:
        bind.execute(
            sa.text(
                "UPDATE products SET category_id=:canonical_id "
                "WHERE category_id = ANY(:category_ids)"
            ),
            {"canonical_id": canonical_id, "category_ids": category_ids},
        )
        bind.execute(
            sa.text(
                "DELETE FROM categories WHERE category_id = ANY(:category_ids) "
                "AND category_id <> :canonical_id"
            ),
            {"canonical_id": canonical_id, "category_ids": category_ids},
        )

    op.drop_constraint(
        "uq_categories_business_name", "categories", type_="unique"
    )
    op.drop_index("ix_categories_business_id", table_name="categories")
    op.drop_column("categories", "business_id")
    op.create_unique_constraint(
        "categories_category_name_key", "categories", ["category_name"]
    )
