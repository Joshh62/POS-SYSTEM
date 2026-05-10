"""Add branding columns to businesses table.

Adds:
- logo_url:    Cloudinary URL for business logo
- brand_color: hex color for invoice/receipt header (default blue)
- email:       business contact email

SAFE MIGRATION — adds nullable columns only.

Revision ID: 0014_add_branding
Revises: 0013_add_supplier_scoping
"""

from alembic import op
import sqlalchemy as sa

revision      = "0014_add_branding"
down_revision = "0013_add_supplier_scoping"
branch_labels = None
depends_on    = None


def upgrade():
    conn = op.get_bind()

    def sql(s):
        conn.execute(sa.text(s))

    sql("ALTER TABLE businesses ADD COLUMN IF NOT EXISTS logo_url    VARCHAR(500) NULL;")
    sql("ALTER TABLE businesses ADD COLUMN IF NOT EXISTS brand_color VARCHAR(7)   NULL DEFAULT '#185FA5';")
    sql("ALTER TABLE businesses ADD COLUMN IF NOT EXISTS email       VARCHAR(200) NULL;")


def downgrade():
    conn = op.get_bind()

    def sql(s):
        conn.execute(sa.text(s))

    sql("ALTER TABLE businesses DROP COLUMN IF EXISTS logo_url;")
    sql("ALTER TABLE businesses DROP COLUMN IF EXISTS brand_color;")
    sql("ALTER TABLE businesses DROP COLUMN IF EXISTS email;")