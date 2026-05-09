"""Add supplier scoping and product-supplier link.

Changes:
- suppliers: add business_id (scopes suppliers to a business)
- products: add supplier_id (links product to its primary supplier)

Existing suppliers assigned to first business via RLS bypass.

Revision ID: 0013_add_supplier_scoping
Revises: 0012_add_business_id_to_products
"""

from alembic import op
import sqlalchemy as sa

revision      = "0013_add_supplier_scoping"
down_revision = "0012_add_business_id_to_products"
branch_labels = None
depends_on    = None


def upgrade():
    conn = op.get_bind()

    def sql(s):
        conn.execute(sa.text(s))

    # Bypass RLS
    sql("SET LOCAL app.current_business_id = '0';")

    # ── suppliers: add business_id ────────────────────────────────────────────
    sql("ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS business_id INTEGER REFERENCES businesses(business_id);")

    result = conn.execute(sa.text(
        "SELECT business_id FROM businesses ORDER BY business_id LIMIT 1;"
    ))
    row = result.fetchone()
    first_business_id = row[0] if row else None

    if first_business_id:
        sql(f"UPDATE suppliers SET business_id = {first_business_id} WHERE business_id IS NULL;")

    sql("CREATE INDEX IF NOT EXISTS ix_suppliers_business_id ON suppliers(business_id);")

    # ── products: add supplier_id ─────────────────────────────────────────────
    sql("ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_id INTEGER REFERENCES suppliers(supplier_id) ON DELETE SET NULL;")
    sql("CREATE INDEX IF NOT EXISTS ix_products_supplier_id ON products(supplier_id);")


def downgrade():
    conn = op.get_bind()

    def sql(s):
        conn.execute(sa.text(s))

    sql("DROP INDEX IF EXISTS ix_products_supplier_id;")
    sql("ALTER TABLE products DROP COLUMN IF EXISTS supplier_id;")
    sql("DROP INDEX IF EXISTS ix_suppliers_business_id;")
    sql("ALTER TABLE suppliers DROP COLUMN IF EXISTS business_id;")