"""add businesses table and multi-branch support

Revision ID: 0002_add_businesses
Revises: bf939ccc175e
Create Date: 2026-04-27
"""

from alembic import op
import sqlalchemy as sa

revision = "0002_add_businesses"
down_revision = "bf939ccc175e"
branch_labels = None
depends_on = None


def upgrade():
    # ── 1. Create businesses table ────────────────────────────────────────────
    op.create_table(
        "businesses",
        sa.Column("business_id",  sa.Integer(),     primary_key=True),
        sa.Column("name",         sa.String(),      nullable=False),
        sa.Column("address",      sa.String(),      nullable=True),
        sa.Column("phone",        sa.String(),      nullable=True),
        sa.Column("owner_name",   sa.String(),      nullable=True),
        sa.Column("is_active",    sa.Boolean(),     default=True, server_default="true"),
        sa.Column("created_at",   sa.DateTime(),    server_default=sa.func.now()),
    )

    # ── 2. Insert default business for existing data ──────────────────────────
    op.execute("""
        INSERT INTO businesses (business_id, name, address, phone, owner_name)
        VALUES (1, 'Default Business', 'Kaduna', NULL, NULL)
    """)

    # ── 3. Clean up test branches, reset sequence, insert clean branch ────────
    op.execute("DELETE FROM branch_inventory")
    op.execute("DELETE FROM inventory_movements")
    op.execute("DELETE FROM sale_items")
    op.execute("DELETE FROM sales")
    op.execute("DELETE FROM users WHERE role != 'superadmin'")
    op.execute("DELETE FROM branches")
    op.execute("ALTER SEQUENCE branches_branch_id_seq RESTART WITH 1")

    op.execute("""
        INSERT INTO branches (branch_id, name, location)
        VALUES (1, 'Main Branch', 'Kaduna')
    """)

    # ── 4. Add business_id to branches ───────────────────────────────────────
    op.add_column("branches",
        sa.Column("business_id", sa.Integer(),
                  sa.ForeignKey("businesses.business_id"), nullable=True)
    )
    op.execute("UPDATE branches SET business_id = 1")
    op.alter_column("branches", "business_id", nullable=False)

    # ── 5. Add business_id to users ───────────────────────────────────────────
    op.add_column("users",
        sa.Column("business_id", sa.Integer(),
                  sa.ForeignKey("businesses.business_id"), nullable=True)
    )
    op.execute("UPDATE users SET business_id = 1")
    # Note: superadmin users will have business_id = NULL (they span all businesses)
    op.execute("UPDATE users SET business_id = NULL WHERE role = 'superadmin'")

    # ── 6. Reset users sequence ───────────────────────────────────────────────
    op.execute("ALTER SEQUENCE users_user_id_seq RESTART WITH 1")


def downgrade():
    op.drop_column("users", "business_id")
    op.drop_column("branches", "business_id")
    op.drop_table("businesses")