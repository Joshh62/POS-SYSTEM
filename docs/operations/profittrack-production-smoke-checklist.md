# ProfitTrack Production Smoke Checklist

Run this checklist only within an approved release window. Record pass/fail,
timestamp, operator, release commit, and deployment identifier. Record no
credentials, connection strings, personal data, or transaction details.

## Platform and access

- [ ] `GET /live` returns HTTP 200 and identifies `profittrack-api`.
- [ ] `GET /health` returns HTTP 200 with `database: ok`.
- [ ] An invalid login is rejected without exposing internal details.
- [ ] An approved test user can authenticate and access only its business and
      branch scope.
- [ ] The platform-wide WhatsApp trigger rejects non-superadmin callers.

## Read-only business checks

- [ ] Products, inventory, customers, suppliers, and reports load for the
      approved test business.
- [ ] Cross-business and cross-branch identifiers do not disclose records.
- [ ] Existing inventory, receivable, loyalty, transfer, and expense summaries
      reconcile to their approved pre-release comparison points.

## Controlled transaction checks

Perform only where an approved isolated test business and low-value test data
exist.

- [ ] Sale completion changes stock exactly once and produces its evidence.
- [ ] Refund restores the approved quantity and creates linked evidence.
- [ ] Purchase receipt increases stock exactly once.
- [ ] Manual adjustment/re-stock creates the required movement and audit trail.
- [ ] Receivable payment/write-off behavior reconciles the ledger.
- [ ] Stock transfer preserves source/destination quantities and traceability.
- [ ] Loyalty earn/redeem behavior reconciles account balance and ledger.
- [ ] Expense creation/reversal reconciles reports and preserves history.

Use supported refund/reversal functions for cleanup. Do not delete or directly
edit financial, inventory, loyalty, transfer, or audit rows with SQL.

## Release close

- [ ] No new critical application or database errors appear during observation.
- [ ] Deployment and migration revisions match the approved commit.
- [ ] Smoke evidence is stored in the approved restricted evidence location.
- [ ] Any failure is linked to an incident and the release is not represented as
      verified until resolved and retested.
