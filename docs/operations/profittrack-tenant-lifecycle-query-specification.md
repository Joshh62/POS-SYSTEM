# ProfitTrack Tenant Lifecycle Query Specification

## Status and scope

**Status:** Draft for operational approval  
**Prepared:** 2026-09-19  
**Owner:** Founder & CEO  
**Implementation state:** Documentation only; no runtime, database, migration, deployment or scheduler change is authorised by this record.

This specification defines a read-only, privacy-minimised tenant lifecycle view for internal customer-success follow-up. It converts existing tenant, setup and completed-sale facts into coarse operational signals. It does not authorise copying tenant identities, customer data, transaction detail or revenue into monitoring or corporate records.

## Canonical definitions

All time comparisons use UTC. Only sales whose status is exactly `completed` count toward first value or activity.

| Signal | Canonical definition | Interpretation |
|---|---|---|
| Registered | A row exists in `businesses` | The tenant account exists; registration alone does not show setup or value |
| Setup ready | The tenant has at least one branch, at least one active tenant user and at least one tenant-scoped product | The minimum configuration needed to attempt a real sale exists |
| First value | At least one completed sale exists through a branch belonging to the tenant | The earliest completed sale timestamp is `first_value_at` |
| Active 30 day | At least one completed sale exists in the rolling 30-day UTC window | Current product use is evidenced, but satisfaction, retention and revenue quality are not |
| Follow-up due | An eligible active tenant meets an onboarding or reactivation rule | This is an action flag, not a lifecycle stage |

Voided, refunded, cancelled, failed, pending or otherwise non-completed sales do not establish first value or recent activity.

## Lifecycle-stage precedence

Each eligible tenant receives exactly one current lifecycle stage:

1. `active_30d` — at least one completed sale in the rolling 30-day window;
2. `first_value` — a completed sale exists, but none in the rolling 30-day window;
3. `setup_ready` — setup-ready criteria are satisfied, but no completed sale exists;
4. `registered` — the tenant exists but setup-ready criteria are not yet satisfied.

The order is deliberate. A tenant that is active in 30 days has necessarily reached first value; the query returns only the highest current stage while retaining separate booleans for aggregate reporting.

## Follow-up rules

Only tenants where `businesses.is_active = true` and `subscription_status <> 'deletion_pending'` are eligible for automatic follow-up classification.

| Follow-up state | Exact rule | Intended action |
|---|---|---|
| `monitor_new` | No first value and tenant age is under 7 complete days | Observe; do not treat as overdue |
| `onboarding_follow_up` | No first value and tenant age is at least 7 complete days | Private onboarding contact |
| `reactivation_follow_up` | First value exists but no completed sale in the rolling 30-day window | Private reactivation contact |
| `none` | At least one completed sale exists in the rolling 30-day window | No lifecycle-triggered follow-up |
| `excluded` | Tenant is inactive or pending deletion | No automatic commercial contact from this query |

`follow_up_due` is true only for `onboarding_follow_up` or `reactivation_follow_up`.

The seven-day onboarding threshold and rolling 30-day reactivation threshold are operating defaults. Changing either threshold is a controlled product/customer-success decision and must update this specification, tests and user-facing interpretation together.

## Approved read-only query draft

This query returns one row per tenant and no tenant name, owner name, phone, email, customer, cashier, payment method, product identity, line item or monetary value.

```sql
WITH tenant_base AS (
    SELECT
        b.business_id,
        b.created_at AS registered_at,
        COALESCE(b.is_active, FALSE) AS tenant_enabled,
        COALESCE(b.subscription_status, 'active') AS subscription_status
    FROM businesses AS b
),
branch_setup AS (
    SELECT
        br.business_id,
        COUNT(*) AS branch_count
    FROM branches AS br
    WHERE br.business_id IS NOT NULL
    GROUP BY br.business_id
),
user_setup AS (
    SELECT
        u.business_id,
        COUNT(*) FILTER (WHERE u.is_active IS TRUE) AS active_user_count
    FROM users AS u
    WHERE u.business_id IS NOT NULL
    GROUP BY u.business_id
),
product_setup AS (
    SELECT
        p.business_id,
        COUNT(*) AS product_count
    FROM products AS p
    WHERE p.business_id IS NOT NULL
    GROUP BY p.business_id
),
completed_sales AS (
    SELECT
        br.business_id,
        MIN(s.sale_date) AS first_value_at,
        MAX(s.sale_date) AS last_completed_sale_at,
        COUNT(*) FILTER (
            WHERE s.sale_date >= CURRENT_TIMESTAMP - INTERVAL '30 days'
        ) AS completed_sales_30d
    FROM sales AS s
    JOIN branches AS br
      ON br.branch_id = s.branch_id
    WHERE s.status = 'completed'
      AND br.business_id IS NOT NULL
    GROUP BY br.business_id
),
signals AS (
    SELECT
        t.business_id,
        t.registered_at,
        GREATEST(
            CURRENT_DATE - CAST(t.registered_at AS date),
            0
        ) AS tenant_age_days,
        (
            COALESCE(bs.branch_count, 0) >= 1
            AND COALESCE(us.active_user_count, 0) >= 1
            AND COALESCE(ps.product_count, 0) >= 1
        ) AS setup_ready,
        cs.first_value_at,
        cs.last_completed_sale_at,
        (cs.first_value_at IS NOT NULL) AS first_value,
        (COALESCE(cs.completed_sales_30d, 0) >= 1) AS active_30d,
        (
            t.tenant_enabled
            AND t.subscription_status <> 'deletion_pending'
        ) AS follow_up_eligible
    FROM tenant_base AS t
    LEFT JOIN branch_setup AS bs
      ON bs.business_id = t.business_id
    LEFT JOIN user_setup AS us
      ON us.business_id = t.business_id
    LEFT JOIN product_setup AS ps
      ON ps.business_id = t.business_id
    LEFT JOIN completed_sales AS cs
      ON cs.business_id = t.business_id
)
SELECT
    business_id,
    registered_at,
    tenant_age_days,
    setup_ready,
    first_value,
    first_value_at,
    active_30d,
    last_completed_sale_at,
    CASE
        WHEN active_30d THEN 'active_30d'
        WHEN first_value THEN 'first_value'
        WHEN setup_ready THEN 'setup_ready'
        ELSE 'registered'
    END AS lifecycle_stage,
    CASE
        WHEN NOT follow_up_eligible THEN FALSE
        WHEN active_30d THEN FALSE
        WHEN first_value THEN TRUE
        WHEN tenant_age_days >= 7 THEN TRUE
        ELSE FALSE
    END AS follow_up_due,
    CASE
        WHEN NOT follow_up_eligible THEN 'excluded'
        WHEN active_30d THEN 'none'
        WHEN first_value THEN 'reactivation_follow_up'
        WHEN tenant_age_days >= 7 THEN 'onboarding_follow_up'
        ELSE 'monitor_new'
    END AS follow_up_reason
FROM signals
ORDER BY registered_at DESC, business_id DESC;
```

## Read-only and privacy controls

1. Run using a read-only database role where available.
2. The statement must remain a single `SELECT` composed of common table expressions.
3. Do not add `INSERT`, `UPDATE`, `DELETE`, `MERGE`, DDL, locks or stored-procedure calls.
4. Do not select tenant name, owner name, phone, email or address.
5. Do not select customer, supplier, cashier, product, payment, sale-item or refund details.
6. Do not select prices, totals, discounts, costs, profit, revenue or payment amounts.
7. Use `business_id` only inside authorised operational access. External working notes must use an assigned pseudonymous reference such as `TENANT-FU-007`.
8. Corporate records may receive only sanitized aggregate conclusions and unresolved actions.
9. Query output must not be exported to public storage, messaging channels or the corporate repository.
10. Lifecycle signals are operational indicators, not evidence of satisfaction, retention, commercial success or product-market fit.

## Current implementation comparison

The current `GET /businesses/` superadmin implementation already:

- restricts cross-tenant activity to the superadmin role;
- counts only completed sales;
- exposes aggregate activity without customer, product, cashier, payment or revenue detail;
- distinguishes recent activity and coarse follow-up states; and
- has database-backed tenant-isolation and privacy tests.

The following differences must be resolved in a later implementation change:

| Area | Current implementation | Canonical specification |
|---|---|---|
| Setup ready | At least one branch and one user | At least one branch, one active tenant user and one tenant-scoped product |
| Lifecycle stage | `registered`, `setup_ready` or `first_value` | Adds `active_30d` as the highest stage |
| Follow-up eligibility | Does not explicitly exclude inactive or deletion-pending tenants | Excludes both |
| Query shape | Aggregate sales subquery plus per-tenant branch/user count queries | Set-based read-only aggregates for branches, users, products and sales |
| Output | Includes tenant administration and identity fields for the authorised superadmin UI | Lifecycle query itself returns only pseudonymous operational fields |

These are documented implementation deltas, not defects declared against the currently deployed system. No code change should be merged during the readiness observation window.

## Acceptance checklist for later implementation

- [ ] Definitions above receive explicit operational approval.
- [ ] Query executes through a read-only path.
- [ ] Stage precedence is covered by database-backed tests.
- [ ] Setup-ready requires branch, active user and tenant-scoped product.
- [ ] Completed sales alone establish first value and activity.
- [ ] Inactive and deletion-pending tenants are excluded from follow-up.
- [ ] Cross-tenant access remains superadmin-only.
- [ ] Response omits all forbidden identity, transaction and monetary fields.
- [ ] Existing tenant isolation tests continue to pass.
- [ ] Full backend suite passes.
- [ ] No migration is introduced unless independently justified.
- [ ] Production deployment occurs only through a separately reviewed change after the observation window.

## Approval decision

Approval of this document authorises the lifecycle definitions and read-only query design only. It does not authorise implementation, merge, deployment, customer contact, data export or a claim of longitudinal effectiveness.
