"""Record each Paystack transaction once before applying subscription entitlement."""
from alembic import op
import sqlalchemy as sa

revision = "0027_payment_activation_ledger"
down_revision = "0026_tenant_scope_categories"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table(
        "subscription_payment_activations",
        sa.Column("reference", sa.String(120), primary_key=True),
        sa.Column("business_id", sa.Integer(), sa.ForeignKey("businesses.business_id"), nullable=False),
        sa.Column("plan", sa.String(30), nullable=False),
        sa.Column("billing", sa.String(20), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("activated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_subscription_payment_activations_business_id", "subscription_payment_activations", ["business_id"])
    op.create_table(
        "subscription_payment_intents",
        sa.Column("reference", sa.String(120), primary_key=True),
        sa.Column("business_id", sa.Integer(), sa.ForeignKey("businesses.business_id"), nullable=False),
        sa.Column("plan", sa.String(30), nullable=False),
        sa.Column("billing", sa.String(20), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_subscription_payment_intents_business_id", "subscription_payment_intents", ["business_id"])
    # Webhooks must verify against Paystack and use an explicit, controlled
    # database context; no general public read/write policy is granted here.

def downgrade():
    op.drop_index("ix_subscription_payment_intents_business_id", table_name="subscription_payment_intents")
    op.drop_table("subscription_payment_intents")
    op.drop_index("ix_subscription_payment_activations_business_id", table_name="subscription_payment_activations")
    op.drop_table("subscription_payment_activations")
