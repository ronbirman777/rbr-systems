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

- The overview loads at most 5,000 subscription rows (`.limit(5000)`); beyond that the figures would silently undercount.
- Amounts are minor units, pre-tax, per currency; there is no currency conversion.
- MRR is a monthly figure only because the single plan interval is `month`; a `year` plan would need normalisation (`billing_plans.billing_interval` allows it, nothing sells it).
- `effective_amount_minor` is derived from the latest invoice (`subtotal - discount`), so it is as fresh as the last synced invoice.

## QA rows

| Surface | How QA data is kept out |
|---|---|
| Overview metrics | Exempt rows are separated into `exempt`. QA Spaces should be marked exempt to be excluded. **The code has no other QA filter**: a QA Space with a real (non-exempt) subscription row would be counted. Test-mode Stripe subscriptions on Staging are in a separate database from Production |
| Subscriptions list | `status <> 'exempt'` unless `includeExempt` is requested |
| Audit page | `qaAuditReason()` flags entries with action `qa032.*`, `request_id` starting `qa032`, payload containing `QA32I`/`qa032`, or written at or before 2026-10-09T06:00Z by a non-Admin account (the ~28 entries that predate the markers). Flagged rows get a "QA" badge and are hidden by the page's default filter. The log itself is never edited |
| Business metrics | `metrics.ts` reads subscriptions only (a test asserts audit rows are not an input) |
