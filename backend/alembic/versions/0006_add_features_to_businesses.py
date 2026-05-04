"""Add features JSONB column to businesses table for per-client feature flags.

Each business gets a features object controlling which modules are visible.
Defaults to all features enabled so existing businesses are unaffected.

SAFE MIGRATION — only adds a column with a default value.
Preview with: alembic upgrade head --sql before running.

Revision ID: 0006_add_features_to_businesses
Revises: 0005_add_rls_policies
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision      = "0006_add_features_to_businesses"
down_revision = "0005_add_rls_policies"
branch_labels = None
depends_on    = None

DEFAULT_FEATURES = """{
    "expiry_tracking": true,
    "loyalty_program": true,
    "debt_tracking": true,
    "whatsapp_reports": true,
    "expense_tracking": true,
    "bulk_import": true,
    "multi_branch": true,
    "reports": true,
    "inventory": true
}"""


def upgrade():
    op.add_column(
        "businesses",
        sa.Column(
            "features",
            JSONB,
            nullable=False,
            server_default=DEFAULT_FEATURES,
        ),
    )


def downgrade():
    op.drop_column("businesses", "features")