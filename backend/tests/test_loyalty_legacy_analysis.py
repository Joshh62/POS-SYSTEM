import json

from sqlalchemy import create_engine, text

from scripts import loyalty_legacy_analysis


def _database():
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        for statement in (
            "CREATE TABLE alembic_version (version_num TEXT)",
            "INSERT INTO alembic_version VALUES ('0025_expense_ledger_guard')",
            "CREATE TABLE branches (branch_id INTEGER, business_id INTEGER)",
            "CREATE TABLE customers (customer_id INTEGER, business_id INTEGER)",
            "CREATE TABLE customer_loyalty (loyalty_id INTEGER, business_id INTEGER, customer_id INTEGER)",
            """CREATE TABLE sales (
                 sale_id INTEGER, branch_id INTEGER, customer_id INTEGER, status TEXT
               )""",
            """CREATE TABLE loyalty_transactions (
                 tx_id INTEGER, loyalty_id INTEGER, business_id INTEGER,
                 customer_id INTEGER, tx_type TEXT, points INTEGER,
                 sale_id INTEGER, balance_before INTEGER, balance_after INTEGER,
                 rate_snapshot NUMERIC, monetary_amount NUMERIC
               )""",
            "INSERT INTO branches VALUES (10, 2)",
            "INSERT INTO customers VALUES (20, 2)",
            "INSERT INTO customer_loyalty VALUES (30, 2, 20)",
            "INSERT INTO sales VALUES (40, 10, 20, 'completed')",
            """INSERT INTO loyalty_transactions VALUES
               (1, 30, 2, 20, 'earn', 5, 40, NULL, NULL, NULL, NULL)""",
            """INSERT INTO loyalty_transactions VALUES
               (2, 30, 2, 20, 'expire', -1, NULL, NULL, NULL, NULL, NULL)""",
            """INSERT INTO loyalty_transactions VALUES
               (3, 30, 2, 20, 'earn', 5, 40, 0, 5, 1, 500)""",
        ):
            connection.execute(text(statement))
    return engine


def test_analysis_classifies_legacy_rows_without_exposing_records():
    engine = _database()
    with engine.connect() as connection:
        result = loyalty_legacy_analysis.collect_analysis(connection)

    assert result["status"] == "analysed"
    assert result["alembic_revision"] == "0025_expense_ledger_guard"
    assert result["counts"] == {
        "legacy_rows_without_complete_evidence": 2,
        "affected_loyalty_accounts": 1,
        "affected_businesses": 1,
        "earn_rows": 1,
        "redeem_rows": 0,
        "expire_rows": 1,
        "missing_balance_before": 2,
        "missing_balance_after": 2,
        "missing_monetary_amount": 2,
        "missing_rate_snapshot_for_sale_rows": 1,
    }
    assert result["linkage"]["sale_rows_linked_to_completed_scoped_sale"] == 1
    assert result["disposition"]["candidate_rows_for_fabricated_backfill"] == 0
    assert result["disposition"]["rows_requiring_bounded_legacy_treatment"] == 2


def test_analysis_flags_sale_linkage_mismatch_for_review():
    engine = _database()
    with engine.begin() as connection:
        connection.execute(text("UPDATE sales SET customer_id=999 WHERE sale_id=40"))
    with engine.connect() as connection:
        result = loyalty_legacy_analysis.collect_analysis(connection)

    assert result["status"] == "review-required"
    assert result["linkage"]["sale_rows_with_customer_mismatch"] == 1
    assert result["disposition"]["linkage_blocker_total"] == 1


def test_analysis_refuses_without_explicit_confirmation(monkeypatch, capsys):
    monkeypatch.setenv("DATABASE_URL", "postgresql://must-not-be-opened")
    monkeypatch.delenv("PROFITTRACK_LOYALTY_ANALYSIS_CONFIRM", raising=False)

    assert loyalty_legacy_analysis.main() == 1
    assert json.loads(capsys.readouterr().out) == {
        "status": "refused",
        "reason": "explicit read-only loyalty-analysis confirmation is required",
    }


def test_analysis_does_not_echo_database_url_on_failure(monkeypatch, capsys):
    secret = "not-a-valid-url-containing-a-secret"
    monkeypatch.setenv("DATABASE_URL", secret)
    monkeypatch.setenv(
        "PROFITTRACK_LOYALTY_ANALYSIS_CONFIRM",
        loyalty_legacy_analysis.CONFIRMATION,
    )

    assert loyalty_legacy_analysis.main() == 1
    output = capsys.readouterr().out
    assert secret not in output
    assert json.loads(output)["status"] == "error"
