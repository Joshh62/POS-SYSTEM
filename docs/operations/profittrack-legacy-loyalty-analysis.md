# ProfitTrack Legacy Loyalty Evidence Analysis

## Purpose

This procedure classifies historical loyalty transactions that predate the
complete sale-linked loyalty evidence model. It is an aggregate, read-only
analysis. It does not repair, delete, overwrite, or reinterpret historical
records.

## Safety boundary

The analyser:

- requires an explicit confirmation phrase;
- opens a transaction and requests PostgreSQL read-only mode;
- always rolls the transaction back;
- prints aggregate counts only;
- never prints transaction IDs, customer IDs, business IDs, names, contact
  details, connection strings, or row payloads;
- never derives missing historical rate or balance snapshots from current
  settings or current account balances;
- always reports zero candidates for fabricated backfill.

A successful analysis does not authorize a data change. Any proposed mutation
requires a separate design, tested migration, explicit approval, production
preflight, rollback path, and evidence reconciliation.

## Run against production

From `backend/`, keep the connection string in the terminal only:

```bash
read -s -p "PRODUCTION DATABASE_URL: " DATABASE_URL
echo
export DATABASE_URL

export PROFITTRACK_LOYALTY_ANALYSIS_CONFIRM="READ_ONLY_LOYALTY_LEGACY_ANALYSIS"

python -m scripts.loyalty_legacy_analysis
ANALYSIS_EXIT=$?

unset PROFITTRACK_LOYALTY_ANALYSIS_CONFIRM DATABASE_URL

echo "Loyalty analysis exit code: $ANALYSIS_EXIT"
```

Exit meanings:

- `0`: analysis completed without sale-linkage blockers;
- `1`: safety refusal, missing configuration, or connection failure;
- `2`: missing schema or a sale-linkage condition requires review.

## Interpreting the result

- `legacy_rows_without_complete_evidence` is the bounded historical population.
- Field-level counts show which snapshots are missing.
- Sale-linkage counts test whether earn/redeem rows still point to completed,
  correctly scoped sales.
- `candidate_rows_for_fabricated_backfill` must remain zero.
- `rows_requiring_bounded_legacy_treatment` is the population whose missing
  snapshots must remain explicitly unknown unless a separate authoritative
  historical source is found.

## Default disposition

When account balances, tenant scope, duplicate guards and sale linkage are
sound but historical snapshots are missing, retain the original rows and record
a bounded evidence gap. Do not populate missing values from present-day loyalty
rates, present-day balances, descriptions, or assumptions.

If linkage blockers are non-zero, stop and investigate through a separately
approved, privacy-minimised procedure. Do not run a corrective statement from
an interactive production console.
