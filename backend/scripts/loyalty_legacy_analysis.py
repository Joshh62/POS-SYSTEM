"""Read-only aggregate analysis of legacy ProfitTrack loyalty evidence gaps.

The script classifies historical loyalty transactions that predate the complete
sale-linked evidence model. It prints aggregate counts only, never row values,
identifiers, connection details, or customer data. It does not infer missing
historical snapshots and does not modify the database.
"""

import json
import os
import sys
from contextlib import closing

from sqlalchemy import create_engine, inspect, text


CONFIRMATION = "READ_ONLY_LOYALTY_LEGACY_ANALYSIS"
REQUIRED_TABLES = {
    "alembic_version",
    "branches",
    "customer_loyalty",
    "customers",
    "loyalty_transactions",
    "sales",
}

INCOMPLETE = """
balance_before IS NULL OR balance_after IS NULL
OR monetary_amount IS NULL
OR (tx_type IN ('earn','redeem') AND rate_snapshot IS NULL)
"""


def _scalar(connection, sql: str) -> int:
    return int(connection.execute(text(sql)).scalar() or 0)


def collect_analysis(connection) -> dict:
    """Return privacy-minimised aggregate classifications."""
    schema = inspect(connection)
    tables = set(schema.get_table_names())
    missing_tables = sorted(REQUIRED_TABLES - tables)
    result = {
        "mode": "read-only-aggregate-loyalty-analysis",
        "alembic_revision": None,
        "missing_required_tables": missing_tables,
        "counts": {},
        "linkage": {},
        "disposition": {},
    }
    if "alembic_version" in tables:
        result["alembic_revision"] = connection.execute(
            text("SELECT version_num FROM alembic_version LIMIT 1")
        ).scalar()
    if missing_tables:
        result["status"] = "blocked"
        return result

    result["counts"] = {
        "legacy_rows_without_complete_evidence": _scalar(
            connection, f"SELECT COUNT(*) FROM loyalty_transactions WHERE {INCOMPLETE}"
        ),
        "affected_loyalty_accounts": _scalar(
            connection,
            f"""SELECT COUNT(DISTINCT loyalty_id)
                FROM loyalty_transactions WHERE {INCOMPLETE}""",
        ),
        "affected_businesses": _scalar(
            connection,
            f"""SELECT COUNT(DISTINCT business_id)
                FROM loyalty_transactions WHERE {INCOMPLETE}""",
        ),
        "earn_rows": _scalar(
            connection,
            f"""SELECT COUNT(*) FROM loyalty_transactions
                WHERE ({INCOMPLETE}) AND tx_type='earn'""",
        ),
        "redeem_rows": _scalar(
            connection,
            f"""SELECT COUNT(*) FROM loyalty_transactions
                WHERE ({INCOMPLETE}) AND tx_type='redeem'""",
        ),
        "expire_rows": _scalar(
            connection,
            f"""SELECT COUNT(*) FROM loyalty_transactions
                WHERE ({INCOMPLETE}) AND tx_type='expire'""",
        ),
        "missing_balance_before": _scalar(
            connection,
            f"""SELECT COUNT(*) FROM loyalty_transactions
                WHERE ({INCOMPLETE}) AND balance_before IS NULL""",
        ),
        "missing_balance_after": _scalar(
            connection,
            f"""SELECT COUNT(*) FROM loyalty_transactions
                WHERE ({INCOMPLETE}) AND balance_after IS NULL""",
        ),
        "missing_monetary_amount": _scalar(
            connection,
            f"""SELECT COUNT(*) FROM loyalty_transactions
                WHERE ({INCOMPLETE}) AND monetary_amount IS NULL""",
        ),
        "missing_rate_snapshot_for_sale_rows": _scalar(
            connection,
            f"""SELECT COUNT(*) FROM loyalty_transactions
                WHERE ({INCOMPLETE}) AND tx_type IN ('earn','redeem')
                  AND rate_snapshot IS NULL""",
        ),
    }

    sale_rows = f"({INCOMPLETE}) AND lt.tx_type IN ('earn','redeem')"
    result["linkage"] = {
        "sale_rows_without_sale_id": _scalar(
            connection,
            f"""SELECT COUNT(*) FROM loyalty_transactions lt
                WHERE {sale_rows} AND lt.sale_id IS NULL""",
        ),
        "sale_rows_with_missing_sale": _scalar(
            connection,
            f"""SELECT COUNT(*) FROM loyalty_transactions lt
                LEFT JOIN sales s ON s.sale_id=lt.sale_id
                WHERE {sale_rows} AND lt.sale_id IS NOT NULL
                  AND s.sale_id IS NULL""",
        ),
        "sale_rows_with_customer_mismatch": _scalar(
            connection,
            f"""SELECT COUNT(*) FROM loyalty_transactions lt
                JOIN sales s ON s.sale_id=lt.sale_id
                WHERE {sale_rows}
                  AND s.customer_id IS DISTINCT FROM lt.customer_id""",
        ),
        "sale_rows_with_business_mismatch": _scalar(
            connection,
            f"""SELECT COUNT(*) FROM loyalty_transactions lt
                JOIN sales s ON s.sale_id=lt.sale_id
                JOIN branches b ON b.branch_id=s.branch_id
                WHERE {sale_rows}
                  AND b.business_id IS DISTINCT FROM lt.business_id""",
        ),
        "sale_rows_not_completed": _scalar(
            connection,
            f"""SELECT COUNT(*) FROM loyalty_transactions lt
                JOIN sales s ON s.sale_id=lt.sale_id
                WHERE {sale_rows} AND s.status<>'completed'""",
        ),
        "sale_rows_linked_to_completed_scoped_sale": _scalar(
            connection,
            f"""SELECT COUNT(*) FROM loyalty_transactions lt
                JOIN sales s ON s.sale_id=lt.sale_id
                JOIN branches b ON b.branch_id=s.branch_id
                WHERE {sale_rows}
                  AND s.customer_id=lt.customer_id
                  AND b.business_id=lt.business_id
                  AND s.status='completed'""",
        ),
    }

    gap_total = result["counts"]["legacy_rows_without_complete_evidence"]
    linkage_blockers = sum(
        value for key, value in result["linkage"].items()
        if key != "sale_rows_linked_to_completed_scoped_sale"
    )
    result["disposition"] = {
        "candidate_rows_for_fabricated_backfill": 0,
        "rows_requiring_bounded_legacy_treatment": gap_total,
        "linkage_blocker_total": linkage_blockers,
        "recommended_treatment": (
            "retain-original-rows-and-record-bounded-evidence-gap"
            if gap_total else "no-legacy-treatment-required"
        ),
        "reason": (
            "missing historical balance, monetary, or rate snapshots are not "
            "authoritatively reconstructable from current state"
            if gap_total else "no incomplete historical loyalty rows detected"
        ),
    }
    result["status"] = "analysed" if not linkage_blockers else "review-required"
    return result


def main() -> int:
    if os.getenv("PROFITTRACK_LOYALTY_ANALYSIS_CONFIRM") != CONFIRMATION:
        print(json.dumps({
            "status": "refused",
            "reason": "explicit read-only loyalty-analysis confirmation is required",
        }))
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
                if connection.dialect.name == "postgresql":
                    connection.execute(text("SET TRANSACTION READ ONLY"))
                result = collect_analysis(connection)
            finally:
                transaction.rollback()
        engine.dispose()
    except Exception as exc:
        print(json.dumps({"status": "error", "error_type": type(exc).__name__}))
        return 1

    print(json.dumps(result, indent=2, sort_keys=True))
    return 2 if result["status"] in {"blocked", "review-required"} else 0


if __name__ == "__main__":
    sys.exit(main())
