# ProfitTrack Production Sentry Canary — 2026-09-11

## Purpose and evidence boundary

This record preserves a sanitized, point-in-time verification of ProfitTrack
production error ingestion and notification routing. It does not establish
longitudinal availability, alert effectiveness, incident-response performance,
or the absence of production defects.

No DSN, host or server identifier, Sentry numeric project identifier,
notification identifier, private URL, credential, tenant data, customer data,
or transaction data is retained here.

## Configuration observed

- Sentry project slug: `profittrack-backend`
- Environment filter: `production`
- Issue category filter: `error`
- Triggers: new issue, escalation, and regression
- Notification throttle: 30 minutes per issue
- Action: configured team email notification route
- Backend release associated with the canary: `dc314644`

## Controlled verification

On 11 September 2026 at approximately 14:31 WAT, an authorized operator used
the production Render service shell to submit one deliberately labelled Sentry
message at error level. The event carried the non-sensitive canary tag
`pt-production-20260911-01` and contained no user, tenant, customer, or
transaction context.

The following observations were made:

1. The Render environment confirmed that the Sentry configuration variable was
   present without displaying its value.
2. The SDK returned a submission identifier; that identifier is retained only
   in restricted operational evidence.
3. Sentry displayed a new issue titled `ProfitTrack production monitoring
   canary` in the `profittrack-backend` project with environment `production`
   and level `error`.
4. The dedicated `ProfitTrack production error alert` recorded one trigger for
   the canary.
5. A notification email identified the dedicated alert as its triggering rule.
6. The canary event showed no associated user.

The canary was captured deliberately and did not represent a customer-impacting
failure. The command ran as a separate process in the production service shell;
it did not crash, restart, or deliberately degrade the running application.

## Corroborating observation

Before this canary, the same Sentry project already contained runtime events
attributed to deployed ProfitTrack application routes. Those observations
corroborate application-side SDK activity, but unresolved performance findings
and intermittent database-connection errors remain separate engineering work
and are not closed by this canary.

## Retained limitations and follow-up

- One manually initiated canary proves only a bounded ingestion and routing
  path at the observed time.
- The shell canary does not by itself test every automatic exception path in
  the long-running web process.
- Receipt of one email does not establish delivery reliability over time.
- Existing overlapping project-wide and dedicated rules may produce duplicate
  notifications; their scopes should be reviewed before either rule is
  disabled.
- Existing N+1 query findings and database-connection errors require diagnosis,
  remediation where appropriate, and independent verification.
- This evidence does not promote any engineering or monitoring control beyond
  its existing evidence state.

