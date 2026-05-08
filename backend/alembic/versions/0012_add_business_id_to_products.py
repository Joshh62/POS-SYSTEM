"""Add business_id to products table for proper multi-tenant product isolation.

Each product now belongs to a specific business. Products created by one
business are not visible to other businesses.

Existing products are assigned to business_id = 1 (first business) by default.
Uses RLS bypass to handle the FK constraint safely.

SAFE MIGRATION — adds nullable column then backfills.

Revision ID: 0012_add_business_id_to_products
Revises: 0011_add_discount_to_sales
"""

from alembic import op
import sqlalchemy as sa

revision      = "0012_add_business_id_to_products"
down_revision = "0011_add_discount_to_sales"
branch_labels = None
depends_on    = None


def upgrade():
    conn = op.get_bind()

    def sql(s):
        conn.execute(sa.text(s))

    # Bypass RLS so FK check can see businesses table
    sql("SET LOCAL app.current_business_id = '0';")

    # Add business_id column — nullable first so existing rows don't fail
    sql("ALTER TABLE products ADD COLUMN IF NOT EXISTS business_id INTEGER REFERENCES businesses(business_id);")

    # Get the first real business_id
    result = conn.execute(sa.text(
        "SELECT business_id FROM businesses ORDER BY business_id LIMIT 1;"
    ))
    row = result.fetchone()
    first_business_id = row[0] if row else None

    if first_business_id:
        sql(f"UPDATE products SET business_id = {first_business_id} WHERE business_id IS NULL;")

    # Add index for efficient filtering
    sql("CREATE INDEX IF NOT EXISTS ix_products_business_id ON products(business_id);")


def downgrade():
    conn = op.get_bind()
    conn.execute(sa.text("DROP INDEX IF EXISTS ix_products_business_id;"))
    conn.execute(sa.text("ALTER TABLE products DROP COLUMN IF EXISTS business_id;"))