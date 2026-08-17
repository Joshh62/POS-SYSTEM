"""add customer debt and immutable credit-ledger assurance

Revision ID: 0022_receivables_ledger_guard
Revises: 0021_inventory_adjustment_guard
Create Date: 2026-08-17
"""
from alembic import op
import sqlalchemy as sa


revision = "0022_receivables_ledger_guard"
down_revision = "0021_inventory_adjustment_guard"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    # Migration 0009 intentionally removed these tables, but the application
    # later restored their ORM models without restoring the Alembic chain.
    # Create them only when absent; existing installations keep their rows.
    debts_created = "debts" not in tables
    if debts_created:
        op.create_table(
            "debts",
            sa.Column("debt_id", sa.Integer(), primary_key=True),
            sa.Column("business_id", sa.Integer(), sa.ForeignKey("businesses.business_id"), nullable=False),
            sa.Column("branch_id", sa.Integer(), sa.ForeignKey("branches.branch_id"), nullable=False),
            sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.customer_id"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.user_id"), nullable=False),
            sa.Column("sale_id", sa.Integer(), sa.ForeignKey("sales.sale_id"), nullable=True),
            sa.Column("total_amount", sa.Numeric(12, 2), nullable=False),
            sa.Column("amount_paid", sa.Numeric(12, 2), nullable=False, server_default="0"),
            sa.Column("balance", sa.Numeric(12, 2), nullable=False),
            sa.Column("description", sa.String(500), nullable=True),
            sa.Column("due_date", sa.Date(), nullable=True),
            sa.Column("status", sa.String(20), nullable=False, server_default="open"),
            sa.Column("written_off_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
            sa.Column("written_off_at", sa.DateTime(), nullable=True),
            sa.Column("written_off_by", sa.Integer(), sa.ForeignKey("users.user_id"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        tables.add("debts")
    else:
        debt_columns = {column["name"] for column in inspector.get_columns("debts")}
        if "written_off_amount" not in debt_columns:
            op.add_column("debts", sa.Column(
                "written_off_amount", sa.Numeric(12, 2),
                nullable=False, server_default="0",
            ))
        if "written_off_at" not in debt_columns:
            op.add_column("debts", sa.Column("written_off_at", sa.DateTime(), nullable=True))
        if "written_off_by" not in debt_columns:
            op.add_column("debts", sa.Column("written_off_by", sa.Integer(), nullable=True))
            op.create_foreign_key(
                "fk_debts_written_off_by", "debts", "users",
                ["written_off_by"], ["user_id"],
            )

    inspector = sa.inspect(bind)
    if "debt_payments" not in set(inspector.get_table_names()):
        op.create_table(
            "debt_payments",
            sa.Column("payment_id", sa.Integer(), primary_key=True),
            sa.Column("debt_id", sa.Integer(), sa.ForeignKey("debts.debt_id"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.user_id"), nullable=False),
            sa.Column("amount", sa.Numeric(12, 2), nullable=False),
            sa.Column("payment_method", sa.String(50), nullable=False, server_default="cash"),
            sa.Column("notes", sa.String(500), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )

    inspector = sa.inspect(bind)
    ledger_columns = {
        column["name"]
        for column in inspector.get_columns("customer_ledger_entries")
    }
    if "source_type" not in ledger_columns:
        op.add_column("customer_ledger_entries", sa.Column("source_type", sa.String(30), nullable=True))
    if "debt_id" not in ledger_columns:
        op.add_column("customer_ledger_entries", sa.Column("debt_id", sa.Integer(), nullable=True))
        op.create_foreign_key(
            "fk_ledger_debt", "customer_ledger_entries", "debts",
            ["debt_id"], ["debt_id"],
        )
    if "debt_payment_id" not in ledger_columns:
        op.add_column("customer_ledger_entries", sa.Column("debt_payment_id", sa.Integer(), nullable=True))
        op.create_foreign_key(
            "fk_ledger_debt_payment", "customer_ledger_entries", "debt_payments",
            ["debt_payment_id"], ["payment_id"],
        )
    if "reversal_of_entry_id" not in ledger_columns:
        op.add_column("customer_ledger_entries", sa.Column("reversal_of_entry_id", sa.Integer(), nullable=True))
        op.create_foreign_key(
            "fk_ledger_reversal", "customer_ledger_entries",
            "customer_ledger_entries", ["reversal_of_entry_id"], ["entry_id"],
        )
    if "payment_method" not in ledger_columns:
        op.add_column("customer_ledger_entries", sa.Column("payment_method", sa.String(50), nullable=True))

    inspector = sa.inspect(bind)
    existing_indexes = {
        index["name"]
        for index in inspector.get_indexes("customer_ledger_entries")
    }
    index_specs = (
        ("ix_customer_ledger_entries_debt_id", ["debt_id"], False, None),
        ("ix_customer_ledger_entries_debt_payment_id", ["debt_payment_id"], False, None),
        ("ix_customer_ledger_entries_reversal_of", ["reversal_of_entry_id"], False, None),
        ("uq_ledger_debt_origin", ["debt_id"], True, "source_type = 'debt'"),
        ("uq_ledger_debt_payment_origin", ["debt_payment_id"], True, "debt_payment_id IS NOT NULL"),
        ("uq_ledger_debt_writeoff", ["debt_id"], True, "source_type = 'debt_writeoff'"),
        ("uq_ledger_entry_reversal", ["reversal_of_entry_id"], True, "reversal_of_entry_id IS NOT NULL"),
    )
    for name, columns, unique, predicate in index_specs:
        if name not in existing_indexes:
            options = {}
            if predicate:
                options["postgresql_where"] = sa.text(predicate)
            op.create_index(
                name, "customer_ledger_entries", columns,
                unique=unique, **options,
            )

    # Historical rows are not declared reconciled. NOT VALID constraints still
    # protect all newly inserted or updated records.
    for statement in (
        """ALTER TABLE debts ADD CONSTRAINT ck_debts_amounts
           CHECK (total_amount > 0 AND amount_paid >= 0 AND balance >= 0
                  AND amount_paid <= total_amount
                  AND balance = total_amount - amount_paid) NOT VALID""",
        """ALTER TABLE debts ADD CONSTRAINT ck_debts_status
           CHECK (status IN ('open','partial','paid','written_off')) NOT VALID""",
        """ALTER TABLE debts ADD CONSTRAINT ck_debts_status_values
           CHECK ((status='open' AND amount_paid=0 AND balance>0)
               OR (status='partial' AND amount_paid>0 AND balance>0)
               OR (status='paid' AND balance=0)
               OR (status='written_off' AND balance>0
                   AND written_off_amount=balance
                   AND written_off_at IS NOT NULL
                   AND written_off_by IS NOT NULL)) NOT VALID""",
        """ALTER TABLE debt_payments ADD CONSTRAINT ck_debt_payments_positive
           CHECK (amount > 0) NOT VALID""",
        """ALTER TABLE customer_ledger_entries ADD CONSTRAINT ck_ledger_amount_positive
           CHECK (amount > 0) NOT VALID""",
        """ALTER TABLE customer_ledger_entries ADD CONSTRAINT ck_ledger_entry_type
           CHECK (entry_type IN ('debit','credit')) NOT VALID""",
        """ALTER TABLE customer_ledger_entries ADD CONSTRAINT ck_ledger_source_required
           CHECK (source_type IS NOT NULL) NOT VALID""",
        """ALTER TABLE customer_ledger_entries ADD CONSTRAINT ck_ledger_source_type
           CHECK (source_type IS NULL OR source_type IN
             ('debt','debt_payment','debt_writeoff','manual_debit',
              'manual_payment','writeoff','reversal')) NOT VALID""",
    ):
        op.execute(statement)

    op.execute(
        """
        CREATE OR REPLACE FUNCTION enforce_debt_payment_total() RETURNS trigger AS $$
        DECLARE sold numeric(12,2); prior numeric(12,2);
        BEGIN
          SELECT total_amount INTO sold FROM debts
            WHERE debt_id=NEW.debt_id FOR UPDATE;
          IF sold IS NULL THEN
            RAISE EXCEPTION 'debt does not exist' USING ERRCODE='23503';
          END IF;
          SELECT COALESCE(SUM(amount),0) INTO prior FROM debt_payments
            WHERE debt_id=NEW.debt_id
              AND (TG_OP='INSERT' OR payment_id<>NEW.payment_id);
          IF NEW.amount<=0 OR prior+NEW.amount>sold THEN
            RAISE EXCEPTION 'cumulative payment exceeds debt total' USING ERRCODE='23514';
          END IF;
          RETURN NEW;
        END; $$ LANGUAGE plpgsql;
        CREATE TRIGGER trg_enforce_debt_payment_total
          BEFORE INSERT OR UPDATE ON debt_payments
          FOR EACH ROW EXECUTE FUNCTION enforce_debt_payment_total();
        """
    )
    op.execute(
        """
        CREATE OR REPLACE FUNCTION enforce_receivables_ledger_link() RETURNS trigger AS $$
        DECLARE d debts%ROWTYPE; p debt_payments%ROWTYPE; original customer_ledger_entries%ROWTYPE;
        BEGIN
          IF NEW.amount<=0 OR NEW.entry_type NOT IN ('debit','credit') THEN
            RAISE EXCEPTION 'invalid ledger amount or type' USING ERRCODE='23514';
          END IF;
          IF NEW.source_type IN ('debt','debt_payment','debt_writeoff') THEN
            SELECT * INTO d FROM debts WHERE debt_id=NEW.debt_id FOR UPDATE;
            IF d.debt_id IS NULL OR d.business_id<>NEW.business_id
               OR d.branch_id<>NEW.branch_id OR d.customer_id<>NEW.customer_id THEN
              RAISE EXCEPTION 'ledger debt scope mismatch' USING ERRCODE='23514';
            END IF;
          END IF;
          IF NEW.source_type='debt' AND NEW.entry_type<>'debit' THEN
            RAISE EXCEPTION 'debt origin must be a debit' USING ERRCODE='23514';
          END IF;
          IF NEW.source_type='debt_payment' THEN
            SELECT * INTO p FROM debt_payments WHERE payment_id=NEW.debt_payment_id;
            IF NEW.entry_type<>'credit' OR p.payment_id IS NULL
               OR p.debt_id<>NEW.debt_id OR p.amount<>NEW.amount THEN
              RAISE EXCEPTION 'payment ledger evidence mismatch' USING ERRCODE='23514';
            END IF;
          END IF;
          IF NEW.source_type='debt_writeoff' AND NEW.entry_type<>'credit' THEN
            RAISE EXCEPTION 'write-off origin must be a credit' USING ERRCODE='23514';
          END IF;
          IF NEW.reversal_of_entry_id IS NOT NULL THEN
            SELECT * INTO original FROM customer_ledger_entries
              WHERE entry_id=NEW.reversal_of_entry_id FOR UPDATE;
            IF original.entry_id IS NULL OR original.business_id<>NEW.business_id
               OR original.customer_id<>NEW.customer_id OR original.amount<>NEW.amount
               OR original.entry_type=NEW.entry_type THEN
              RAISE EXCEPTION 'ledger reversal mismatch' USING ERRCODE='23514';
            END IF;
          END IF;
          RETURN NEW;
        END; $$ LANGUAGE plpgsql;
        CREATE TRIGGER trg_enforce_receivables_ledger_link
          BEFORE INSERT OR UPDATE ON customer_ledger_entries
          FOR EACH ROW EXECUTE FUNCTION enforce_receivables_ledger_link();
        """
    )


def downgrade():
    op.execute("DROP TRIGGER IF EXISTS trg_enforce_receivables_ledger_link ON customer_ledger_entries")
    op.execute("DROP FUNCTION IF EXISTS enforce_receivables_ledger_link()")
    op.execute("DROP TRIGGER IF EXISTS trg_enforce_debt_payment_total ON debt_payments")
    op.execute("DROP FUNCTION IF EXISTS enforce_debt_payment_total()")
    for name, table in (
        ("ck_ledger_source_type", "customer_ledger_entries"),
        ("ck_ledger_source_required", "customer_ledger_entries"),
        ("ck_ledger_entry_type", "customer_ledger_entries"),
        ("ck_ledger_amount_positive", "customer_ledger_entries"),
        ("ck_debt_payments_positive", "debt_payments"),
        ("ck_debts_status_values", "debts"),
        ("ck_debts_status", "debts"),
        ("ck_debts_amounts", "debts"),
    ):
        op.drop_constraint(name, table, type_="check")
    for name in (
        "uq_ledger_entry_reversal", "uq_ledger_debt_writeoff",
        "uq_ledger_debt_payment_origin", "uq_ledger_debt_origin",
        "ix_customer_ledger_entries_reversal_of",
        "ix_customer_ledger_entries_debt_payment_id",
        "ix_customer_ledger_entries_debt_id",
    ):
        op.drop_index(name, table_name="customer_ledger_entries")
    op.drop_constraint("fk_ledger_reversal", "customer_ledger_entries", type_="foreignkey")
    op.drop_constraint("fk_ledger_debt_payment", "customer_ledger_entries", type_="foreignkey")
    op.drop_constraint("fk_ledger_debt", "customer_ledger_entries", type_="foreignkey")
    for column in ("payment_method","reversal_of_entry_id","debt_payment_id","debt_id","source_type"):
        op.drop_column("customer_ledger_entries", column)
    op.drop_constraint("fk_debts_written_off_by", "debts", type_="foreignkey")
    for column in ("written_off_by","written_off_at","written_off_amount"):
        op.drop_column("debts", column)
