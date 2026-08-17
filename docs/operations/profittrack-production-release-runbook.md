# ProfitTrack Production Release Runbook

This runbook controls a ProfitTrack production release. It does not establish
that any release, Neon migration, backup, or deployment has occurred.

## Roles and release record

Record the release owner, date/time window, approved Git commit, current backend
and frontend deployments, current Alembic revision, and change summary. Never
put passwords, tokens, connection strings, customer data, or private keys in the
release record.

## 1. Pre-release gates

1. Confirm the target commit is merged to `master` and all required GitHub
   checks pass, including backend tests, fresh-database migrations, and frontend
   build.
2. Review the migrations between the production revision and repository head.
3. Confirm directly in Neon that an appropriate recovery mechanism or restore
   point exists and record only its non-sensitive reference and time.
4. Confirm an approved maintenance window, responsible operator, monitoring
   access, and rollback decision-maker.
5. Run the read-only preflight against production from a controlled terminal:

   ```bash
   export PROFITTRACK_PREFLIGHT_CONFIRM=READ_ONLY_PRODUCTION_PREFLIGHT
   python -m scripts.production_preflight
   ```

   Supply `DATABASE_URL` through the approved secret-management mechanism. Do
   not paste it into tickets, pull requests, logs, or evidence registers.
6. Stop if the preflight reports `blocked`, if the revision is unexpected, or
   if the recovery mechanism has not been directly verified.

## 2. Controlled migration and deployment

1. Preserve the preflight JSON and current revision as restricted release
   evidence; PACL-009 should point to its approved location rather than contain
   the output.
2. Apply the migration once, using the approved production operator and exact
   merged commit. Do not run concurrent migration jobs.
3. Verify `alembic current` reports the expected repository head.
4. Deploy the backend from the same approved commit and wait for `/live` and
   `/health` to succeed.
5. Deploy the frontend from the same approved commit and confirm its build and
   runtime configuration refer to the intended backend.
6. Perform the production smoke checklist. Use approved test records only; do
   not alter real customer transactions merely to create evidence.

## 3. Observation and closure

Observe error rates, readiness failures, database saturation, authentication
failures, and business-critical transaction errors during the agreed window.
Record deployment identifiers, migration revision, smoke outcome, operator,
timestamps, and any incident reference. Only then may corporate evidence state
that the production release was directly verified.

## 4. Failure and recovery

Stop traffic-changing work when readiness fails, migration state is uncertain,
or financial/inventory behavior is inconsistent. Preserve logs without secrets
or personal data, declare an incident, and use the pre-agreed recovery decision.
Prefer a reviewed roll-forward when safe. Use Neon recovery/restore only after
assessing writes since the restore point; do not improvise destructive SQL or
blindly downgrade Alembic in production.
