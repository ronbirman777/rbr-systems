# Failed-payment lifecycle

One clock per failure episode: `space_subscriptions.payment_failed_at` (set once when an episode opens, cleared only by recovery). Every deadline is that timestamp plus **fixed elapsed hours** (never calendar days, so no DST drift). Per Space: a failure on Space A never touches Space B.

| Step | Elapsed | Column stamped | Effect | Customer email |
|---|---|---|---|---|
| Failure observed | 0 | `payment_failed_at` | Everything still available (`payment_issue`) | `payment_failed` (once per failed invoice; not for the first invoice of a new subscription) |
| Guest App unavailable | +24h (`LIFECYCLE_HOURS.guestSuspension`) | `guest_suspended_at` | Guest App off for that Space; Studio still writable and can publish | `guest_unavailable` |
| Studio suspended | +168h = day 7 | `studio_suspended_at` | Studio writes, uploads and publish refused (RLS + `publish_space` + gate page); reads still work | `studio_suspended` |
| Final warning | +288h = day 12 | `deletion_warning_at` | Warning only | `final_warning` |
| Deletion eligible | +336h = day 14 | `eligible_for_deletion_at` | Eligible for the deletion **workflow** | none (the day-12 warning already told them) |

Constants live in SQL (`billing_apply_lifecycle`, `space_access_state`) and TS (`constants.ts`, `lifecycle.ts`, `access.ts`) and are pinned together by tests that read the migration text (`domain.test.ts`) plus shared access vectors; change all together.

## Rules

- **No immediate hard delete.** Day 14 only stamps eligibility. **No deletion job exists in the code**: nothing in the application acts on `eligible_for_deletion_at` beyond showing it in Admin and metrics. Any future deletion must be a separately governed workflow respecting retention and backups.
- Suspension never alters content or the published snapshot. Recovery brings the Guest App back with no republish.
- `billing_apply_lifecycle` is idempotent: each stamp is set at most once, to its deterministic deadline (not the job's wall clock), under `FOR UPDATE SKIP LOCKED`, only while the episode is still open and the row is not exempt. A subscription that just recovered is not suspended by a stale action.
- The cron job (every 15 minutes) applies due steps, enqueues the email with a per-episode dedupe key (`<template>:<subscription>:<payment_failed_at>`), and refreshes the next action. A new episode after a recovery can notify again.
- A Stripe retry date (`next_payment_attempt_at`) is shown as the `payment_retry` next action when it falls before the next lifecycle deadline.

## Recovery

When a later sync sees status `active`/`trialing` with the latest invoice not failed while an episode is open (typically `invoice.paid`): `payment_failed_at`, guest/studio suspension, warning and eligibility stamps are cleared, `recovered_at` is set, and the single payment confirmation goes out with the `recovered` variant. The customer can fix payment through the Billing Portal button on the Billing page.

## Cancellation and ended subscriptions

- Customer cancel = `cancel_at_period_end` (no automatic refund). `cancellation_scheduled` email once per period end. Access continues to the period end; treated as ended 6h after it (`CANCEL_SLACK_HOURS`) even if the deleted webhook was missed. `subscription_ended` email once.
- Ended means Studio and Guest are unavailable, content is preserved. Deleting a Space with a live paid subscription is refused until it is cancelled (`ACTIVE_SUBSCRIPTION`).
- Failure episodes continue after Stripe itself cancels for non-payment, so the day-12 and day-14 steps still apply.
