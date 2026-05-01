"""add plan column to businesses

Revision ID: 0004_add_plan_to_businesses
Revises: 0003_add_expiry_batches
Create Date: 2026-05-01

"""
from alembic import op
import sqlalchemy as sa

revision = "0004_add_plan_to_businesses"
down_revision = "0003_add_expiry_batches"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'businesses',
        sa.Column('plan', sa.String(), nullable=False, server_default='starter')
    )


def downgrade():
    op.drop_column('businesses', 'plan')