# ProfitTrack Non-Production Restore Verification Runbook

This runbook verifies ProfitTrack recovery by creating a Neon branch from a
past point in time and checking it read-only. It must never target, migrate,
overwrite, rename, or delete the production branch or production database.

A successful test proves that the selected recovery point can be materialised
as an isolated branch and that the recovered database satisfies the recorded
schema and aggregate compatibility checks. It does not by itself prove every
future restore, define recovery objectives, or establish long-term backup
effectiveness.

## 1. Roles and record

Record only:

- operator;
- test date and start/end time;
- approved Git commit;
- non-sensitive recovery-branch name;
- selected restore timestamp;
- expected and observed Alembic revision;
- verifier exit code and sanitized JSON;
- read-only application smoke outcome;
- elapsed recovery time;
- gaps, corrective actions and branch deletion/expiry evidence.

Never record passwords, tokens, connection strings, customer data, row values,
private keys or screenshots containing identifiable business/customer data.

## 2. Preconditions

1. Confirm ProfitTrack production remains healthy.
2. Confirm no production migration or deployment is in progress.
3. Confirm the repository master commit and expected Alembic head.
4. In Neon, note the production endpoint hostname only for the target-protection
   check. Do not copy the production password into the record.
5. Choose a restore timestamp within Neon's available history window.
6. Prefer a timestamp five to fifteen minutes in the past and after the latest
   verified migration.
7. Stop if Neon does not offer point-in-time branch creation or if the intended
   timestamp is uncertain.

## 3. Create the isolated recovery branch

In Neon:

1. Open the ProfitTrack project.
2. Select **Branches** and create a new branch.
3. Use a name matching `restore-YYYYMMDD-HHMM`.
4. Select the production branch as parent.
5. Select **Branch data and schema from a past point in time**.
6. Enter the approved past timestamp.
7. Enable short auto-delete, preferably one day.
8. Create the branch.
9. Obtain the new branch connection string from **Connect**.

The branch must show a different endpoint hostname from production. If it does
not, stop. Do not run Alembic against the recovery branch before verification;
the recovered revision is evidence.

## 4. Run the read-only verifier

From `~/POS SYSTEM/backend` with the project virtual environment active:

```bash
unset DATABASE_URL TEST_DATABASE_URL

read -s -p "Recovery branch DATABASE_URL: " RESTORE_DATABASE_URL
echo
export RESTORE_DATABASE_URL

read -p "Recovery branch name: " PROFITTRACK_RESTORE_BRANCH_NAME
export PROFITTRACK_RESTORE_BRANCH_NAME

read -p "Restore point UTC (ISO-8601): " PROFITTRACK_RESTORE_POINT_UTC
export PROFITTRACK_RESTORE_POINT_UTC

read -p "Production database hostname only: " PROFITTRACK_PRODUCTION_DB_HOST
export PROFITTRACK_PRODUCTION_DB_HOST

export PROFITTRACK_RESTORE_TARGET_CLASSIFICATION="isolated-non-production-recovery-branch"
export PROFITTRACK_RESTORE_CONFIRM="VERIFY_ISOLATED_RESTORE_BRANCH"

python -m scripts.restore_verification
RESTORE_VERIFY_EXIT=$?

unset RESTORE_DATABASE_URL   PROFITTRACK_RESTORE_BRANCH_NAME   PROFITTRACK_RESTORE_POINT_UTC   PROFITTRACK_PRODUCTION_DB_HOST   PROFITTRACK_RESTORE_TARGET_CLASSIFICATION   PROFITTRACK_RESTORE_CONFIRM

echo "Restore verification exit code: $RESTORE_VERIFY_EXIT"
```

The verifier:

- refuses to run without all safety declarations;
- refuses a connection whose hostname matches the protected production host;
- starts a read-only transaction;
- runs the same aggregate preflight used for controlled releases;
- checks the expected Alembic revision;
- prints no connection string, password or row value;
- returns `0` only when the revision matches and blocker count is zero;
- returns `2` for a structurally reached but blocked restore;
- returns `1` for refusal or operational error.

## 5. Read-only application smoke

Only after the verifier exits `0`:

1. Set `DATABASE_URL` to the recovery branch URL in the controlled terminal.
2. Start the backend locally without running migrations.
3. Confirm `GET /live` and `GET /health` return HTTP 200.
4. Authenticate only with an approved test account if one existed at the restore
   point.
5. Confirm approved read-only screens load.
6. Do not create sales, refunds, purchases, inventory movements, receivable
   entries, transfers, loyalty entries or expenses.
7. Stop the local backend and unset the URL.

If no approved test account existed at the restore point, record authenticated
smoke as not performed rather than using a real customer's credentials.

## 6. Pass criteria

The test passes only when:

- the point-in-time recovery branch is created successfully;
- the endpoint differs from production;
- the verifier exits `0`;
- the expected Alembic revision is observed;
- required tables are present;
- aggregate blocker total is zero;
- liveness and database readiness pass against the recovery branch;
- no production change occurs;
- no sensitive evidence is retained in the corporate repository;
- and branch deletion or auto-expiry is confirmed.

Warnings must be recorded and bounded. They do not become blockers unless the
runbook owner determines that they invalidate recoverability.

## 7. Failure handling

Stop and record a failed test when:

- the branch cannot be created at the selected timestamp;
- the endpoint matches production;
- revision or required tables do not reconcile;
- blocker count is non-zero;
- application readiness fails;
- credentials or sensitive output are exposed;
- or the recovery branch cannot be deleted/expired as intended.

Do not repair the restored branch merely to make the test pass. Identify the
gap, assign corrective action and repeat with a new isolated branch.

## 8. Closure and evidence boundary

Delete the recovery branch after evidence is captured, or confirm its scheduled
auto-deletion. Preserve only sanitized evidence in the approved restricted
location.

PACL-009 may be updated only after execution evidence exists. Repository code,
passing unit tests and this runbook establish a mechanism; they do not establish
that a restore has occurred.
