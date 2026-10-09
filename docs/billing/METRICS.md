# Admin billing metrics

Defined in code in `lib/billing/admin/metrics.ts` (`computeOverviewMetrics`); this page restates them. Input is `space_subscriptions` rows only. Pending checkouts, coupon entry or validation, and audit rows can never reach a metric.

| Metric | Definition |
|---|---|
| `paidSubscriptions` | status `active` or `trialing`, not exempt. `past_due`/`unpaid` are counted under payment failures, not here |
| `paidSpaces` | Non-exempt subscriptions whose status is not `canceled`/`incomplete_expired`. Includes `incomplete`, `paused`, `past_due`, `unpaid` (they hold a Space) |
| `mrr.listMinor` | Sum of `base_amount_minor` over `paidSubscriptions`, grouped by currency: gross recurring list value before discount |
| `mrr.currentMinor` | Sum of `coalesce(current_effective_amount_minor, base_amount_minor)` over the same set: current discounted recurring amount. Always labelled distinctly from list; the gap is the discount in force |
| `discounted` | Paid subscriptions with an in-progress (`redeemed`) coupon redemption |
| `paymentFailures` | `payment_failed_at` set and not ended |
| `guestSuspended` | Failure episode in phase `guest_suspended` (+24h to before +168h) |
| `studioSuspended` | Failure episode at or after +168h, including the final-warning and deletion-eligible phases, not ended |
| `scheduledCancellations` | Active/trialing with `cancel_at_period_end` (still counted in MRR: they pay until period end) |
| `deletionEligible` | `eligible_for_deletion_at` set |
| `exempt` | Exempt (internal/legacy) Spaces: shown for transparency, never added to revenue or paid counts |

Notes:

- How each figure is read (no fixed row cap; see "How the Overview reads the data" below): every count is an exact database count; only the MRR sums and `discounted` are computed from rows, read in bounded pages, with a visible warning if the bound is hit.
- Amounts are minor units, pre-tax, per currency; there is no currency conversion.
- MRR is a monthly figure only because the single plan interval is `month`; a `year` plan would need normalisation (`billing_plans.billing_interval` allows it, nothing sells it).
- `effective_amount_minor` is derived from the latest invoice (`subtotal - discount`), so it is as fresh as the last synced invoice.

## How the Overview reads the data

Before this change the Overview read at most 5,000 `space_subscriptions` rows (`.limit(5000)`) and 5,000 redeemed `coupon_redemptions` rows, then counted them in memory. Past that the figures would have undercounted with no warning. Supabase's default PostgREST `max-rows` of 1,000 may also have capped each response below 5,000; this was not checked against the hosted project's settings. `loadOverview` in `lib/billing/admin/queries.ts` now works like this:

| Figures | Source | Can it be truncated? |
|---|---|---|
| `paidSubscriptions`, `paidSpaces`, `paymentFailures`, `guestSuspended`, `studioSuspended`, `scheduledCancellations`, `deletionEligible`, `exempt` | One exact count per metric: `select('id', { count: 'exact', head: true })` on `space_subscriptions`, with the filters from `overviewCountSpecs(now)` in `metrics.ts`. No rows are transferred | No |
| Open checkouts, failed events, stuck checkouts | Exact head counts (unchanged) | No |
| `mrr.listMinor`, `mrr.currentMinor`, `discounted` | Rows: `active`/`trialing` subscriptions and `redeemed` redemptions, read by `fetchAllPaged` in pages of 1,000 (`METRIC_PAGE_SIZE`) ordered by `id`, up to a hard bound of 50,000 rows each (`MAX_METRIC_ROWS`) | Yes, past 50,000 rows. Then `metricsTruncated` is true and the page shows a warning (`ovMetricsTruncated`, in all 7 admin dictionaries) naming how many rows were read and which three figures undercount |

Details:

- **Counts are exact.** `space_subscriptions.tenant_id` is UNIQUE, so one row is one Space and the counts need no `DISTINCT`. The lifecycle phases become timestamp bounds on `payment_failed_at` (guest suspended: `<= now - 24h` and `> now - 168h`; studio suspended: `<= now - 168h`). They use the same inclusive boundaries as `lifecyclePhase()`.
- **The count filters are proved equal to the definitions.** `metricsExact.test.ts` runs every `overviewCountSpecs` filter in memory against every subscription status, crossed with failure ages that include the exact 24h and 168h boundaries. Each count must equal `computeOverviewMetrics` on the same rows. The test also checks that every count field has a spec, and it reads the source to confirm `loadOverview` has no `.limit(` and that the page renders the warning.
- **Fail visibly.** A failed count or page throws, so the page shows an error instead of a confident `0`. Previously an error was read as `data: null`, which became 0.
- **Truncation is reported only when it is real.** At the bound, the loader asks for one more row and sets the flag only if that row exists. A table of exactly 50,000 rows is complete.
- **Consistency.** The counts and pages are separate statements, so they are not one snapshot. A write between them can make `paidSubscriptions` (exact) differ by a row or two from the set that MRR summed. That is acceptable for an operational overview; the RPC below removes it.
- Audit rows are still not an input (`qaAudit.test.ts` asserts `loadOverview` never reads `admin_audit_log`). The audit log stays append-only, and nothing here edits or deletes it.

### Future: SQL aggregation RPC (design only, not implemented)

At scale, the paged MRR read should be replaced by one aggregate computed in the database. A future migration would add:

```sql
-- Design only. Needs its own migration, review and the release gate. NOT part of TASK 032.
create function public.admin_billing_overview(p_now timestamptz default now())
returns jsonb
language sql stable security definer set search_path = public, pg_temp
as $$
  with s as (select * from public.space_subscriptions),
  paid as (select * from s where status in ('active','trialing')),
  disc as (select distinct space_subscription_id id from public.coupon_redemptions
           where status = 'redeemed' and space_subscription_id is not null)
  select jsonb_build_object(
    'paid_subscriptions', (select count(*) from paid),
    'paid_spaces',        (select count(*) from s where status not in ('exempt','canceled','incomplete_expired')),
    'mrr_list_minor',     (select coalesce(jsonb_object_agg(cur, amt), '{}') from (
                             select upper(coalesce(currency,'USD')) cur, sum(coalesce(base_amount_minor,0)) amt from paid group by 1) x),
    'mrr_current_minor',  (select coalesce(jsonb_object_agg(cur, amt), '{}') from (
                             select upper(coalesce(currency,'USD')) cur,
                                    sum(coalesce(current_effective_amount_minor, base_amount_minor, 0)) amt from paid group by 1) x),
    'discounted',         (select count(*) from paid join disc using (id)),
    'payment_failures',   (select count(*) from s where payment_failed_at is not null and status not in ('exempt','canceled','incomplete_expired')),
    'guest_suspended',    (select count(*) from s where payment_failed_at is not null and status not in ('exempt','canceled','incomplete_expired')
                             and payment_failed_at <= p_now - interval '24 hours' and payment_failed_at > p_now - interval '168 hours'),
    'studio_suspended',   (select count(*) from s where payment_failed_at is not null and status not in ('exempt','canceled','incomplete_expired')
                             and payment_failed_at <= p_now - interval '168 hours'),
    'scheduled_cancellations', (select count(*) from paid where cancel_at_period_end),
    'deletion_eligible',  (select count(*) from s where eligible_for_deletion_at is not null and status <> 'exempt'),
    'exempt',             (select count(*) from s where status = 'exempt')
  );
$$;
revoke all on function public.admin_billing_overview(timestamptz) from public, anon, authenticated;
grant execute on function public.admin_billing_overview(timestamptz) to service_role;
```

Requirements for that future change:

- Execute is granted to `service_role` only. It is called from `loadOverview` after `requireAdmin*()`, the same as today, and is never exposed to `authenticated`.
- The 24h/168h literals must match `LIFECYCLE_HOURS`. A test should compare them the way `metricsExact.test.ts` compares the filters today.
- Keep `computeOverviewMetrics` as the reference definition, and add an equivalence test of the RPC against it on a seeded Staging dataset.
- One statement gives one consistent snapshot, with no truncation and no warning.

## QA rows

| Surface | How QA data is kept out |
|---|---|
| Overview metrics | Exempt rows are separated into `exempt`. QA Spaces should be marked exempt to be excluded. **The code has no other QA filter**: a QA Space with a real (non-exempt) subscription row would be counted. Test-mode Stripe subscriptions on Staging are in a separate database from Production |
| Subscriptions list | `status <> 'exempt'` unless `includeExempt` is requested |
| Audit page | `qaAuditReason()` flags entries with action `qa032.*`, `request_id` starting `qa032`, payload containing `QA32I`/`qa032`, or written at or before 2026-10-09T06:00Z by a non-Admin account (the ~28 entries that predate the markers). Flagged rows get a "QA" badge and are hidden by the page's default filter. The log itself is never edited |
| Business metrics | `metrics.ts` reads subscriptions only (a test asserts audit rows are not an input) |
