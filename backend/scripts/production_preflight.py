"""Read-only release preflight for an existing ProfitTrack PostgreSQL database.

The script reports schema revision and aggregate blocker/warning counts only. It
does not run migrations, change data, or print connection details or row values.
"""

import json
import os
import sys
from contextlib import closing

from sqlalchemy import create_engine, inspect, text


CONFIRMATION = "READ_ONLY_PRODUCTION_PREFLIGHT"
REQUIRED_TABLES = {
    "alembic_version",
    "businesses",
    "branches",
    "customers",
    "customer_loyalty",
    "loyalty_transactions",
    "stock_transfers",
    "expenses",
}


def _scalar(connection, sql: str) -> int:
    return int(connection.execute(text(sql)).scalar() or 0)


def collect_preflight(connection) -> dict:
    """Collect non-sensitive schema and aggregate compatibility evidence."""
    schema = inspect(connection)
    tables = set(schema.get_table_names())
    missing_tables = sorted(REQUIRED_TABLES - tables)

    result = {
        "mode": "read-only",
        "alembic_revision": None,
        "missing_required_tables": missing_tables,
        "blockers": {},
        "warnings": {},
    }
    if "alembic_version" in tables:
        result["alembic_revision"] = connection.execute(
            text("SELECT version_num FROM alembic_version LIMIT 1")
        ).scalar()

    if "customer_loyalty" in tables:
        columns = {column["name"] for column in schema.get_columns("customer_loyalty")}
        if {"business_id", "customer_id"} <= columns:
            result["blockers"]["duplicate_loyalty_accounts"] = _scalar(
                connection,
                """
                SELECT COUNT(*) FROM (
                  SELECT business_id, customer_id
                  FROM customer_loyalty
                  GROUP BY business_id, customer_id
                  HAVING COUNT(*) > 1
                ) duplicates
                """,
            )
        if {"business_id", "customer_id"} <= columns and "customers" in tables:
            result["blockers"]["loyalty_customer_scope_mismatches"] = _scalar(
                connection,
                """
                SELECT COUNT(*) FROM customer_loyalty cl
                JOIN customers c ON c.customer_id = cl.customer_id
                WHERE c.business_id IS DISTINCT FROM cl.business_id
                """,
            )
        counters = {"points_balance", "lifetime_earned", "lifetime_redeemed", "lifetime_expired"}
        if counters <= columns:
            result["blockers"]["invalid_loyalty_balances"] = _scalar(
                connection,
                """
                SELECT COUNT(*) FROM customer_loyalty
                WHERE points_balance < 0 OR lifetime_earned < 0
                   OR lifetime_redeemed < 0 OR lifetime_expired < 0
                   OR points_balance <> lifetime_earned - lifetime_redeemed - lifetime_expired
                """,
            )

    if "loyalty_transactions" in tables:
        columns = {column["name"] for column in schema.get_columns("loyalty_transactions")}
        if {"sale_id", "tx_type"} <= columns:
            for kind in ("earn", "redeem"):
                result["blockers"][f"duplicate_sale_{kind}_transactions"] = _scalar(
                    connection,
                    f"""
                    SELECT COUNT(*) FROM (
                      SELECT sale_id FROM loyalty_transactions
                      WHERE sale_id IS NOT NULL AND tx_type = '{kind}'
                      GROUP BY sale_id HAVING COUNT(*) > 1
                    ) duplicates
                    """,
                )
        evidence_columns = {
            "balance_before", "balance_after", "rate_snapshot", "monetary_amount"
        }
        if evidence_columns <= columns:
            result["warnings"]["legacy_loyalty_transactions_without_complete_evidence"] = _scalar(
                connection,
                """
                SELECT COUNT(*) FROM loyalty_transactions
                WHERE balance_before IS NULL OR balance_after IS NULL
                   OR monetary_amount IS NULL
                   OR (tx_type IN ('earn','redeem') AND rate_snapshot IS NULL)
                """,
            )
        else:
            result["warnings"]["legacy_loyalty_transactions_requiring_reconciliation"] = _scalar(
                connection, "SELECT COUNT(*) FROM loyalty_transactions"
            )

    if "expenses" in tables:
        columns = {column["name"] for column in schema.get_columns("expenses")}
        if "amount" in columns:
            result["blockers"]["nonpositive_expenses"] = _scalar(
                connection, "SELECT COUNT(*) FROM expenses WHERE amount <= 0"
            )
        if {"business_id", "branch_id"} <= columns and "branches" in tables:
            result["blockers"]["expense_branch_scope_mismatches"] = _scalar(
                connection,
                """
                SELECT COUNT(*) FROM expenses e
                JOIN branches b ON b.branch_id = e.branch_id
                WHERE b.business_id IS DISTINCT FROM e.business_id
                """,
            )

    if "stock_transfers" in tables:
        transfer_columns = {column["name"] for column in schema.get_columns("stock_transfers")}
        evidence_columns = {"business_id", "requested_by", "completed_by", "idempotency_key"}
        if evidence_columns <= transfer_columns:
            result["warnings"]["legacy_stock_transfers_without_complete_evidence"] = _scalar(
                connection,
                """
                SELECT COUNT(*) FROM stock_transfers
                WHERE business_id IS NULL OR requested_by IS NULL
                   OR completed_by IS NULL OR idempotency_key IS NULL
                """,
            )

    result["blocker_total"] = len(missing_tables) + sum(result["blockers"].values())
    result["warning_total"] = sum(result["warnings"].values())
    return result


def main() -> int:
    if os.getenv("PROFITTRACK_PREFLIGHT_CONFIRM") != CONFIRMATION:
        print(
            json.dumps({
                "status": "refused",
                "reason": "explicit read-only confirmation is required",
            })
        )
        return 1

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print(json.dumps({"status": "error", "reason": "DATABASE_URL is not set"}))
        return 1

    try:
        engine = create_engine(database_url)
        with closing(engine.connect()) as connection:
            transaction = connection.begin()
            try:
                connection.execute(text("SET TRANSACTION READ ONLY"))
                result = collect_preflight(connection)
            finally:
                transaction.rollback()
        engine.dispose()
    except Exception as exc:
        print(json.dumps({"status": "error", "error_type": type(exc).__name__}))
        return 1

    result["status"] = "blocked" if result["blocker_total"] else "ready-for-controlled-release"
    print(json.dumps(result, indent=2, sort_keys=True))
    return 2 if result["blocker_total"] else 0


if __name__ == "__main__":
    sys.exit(main())
