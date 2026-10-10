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

## Day 14 is eligibility only (audit, TASK 032)

Audited 2026-10-10 against branch `feat/032-commercial-platform-foundation`:

| Component | What it does at/after Day 14 | Deletes anything? |
|---|---|---|
| `vercel.json` cron `*/15 * * * *` -> `app/src/app/api/cron/billing/route.ts` | Fails closed without `CRON_SECRET`; calls `runBillingJobs` only | No |
| `app/src/lib/billing/lifecycleJob.ts` (`runBillingJobs`) | Expires stale checkouts/reservations (rows marked expired, not removed), reconciles checkouts, resyncs Stripe, calls `billing_apply_lifecycle`, enqueues emails, refreshes next action. `deletion_eligible` has no email and no follow-up action | No |
| SQL `billing_apply_lifecycle` (0038; never redefined later) | `UPDATE space_subscriptions SET eligible_for_deletion_at = <deadline>` (and the earlier stamps) | No: no `DELETE`, `TRUNCATE`, `DROP`, no Storage or `auth.users` access |
| `BillingStore` interface / Supabase store | No delete/remove/purge method exists | No |
| Migrations | No `pg_cron` / `cron.schedule` anywhere | No |
| Admin console (`admin/billing/actions.ts`, `lib/billing/admin/service.ts`) | Shows eligibility in subscription detail, Overview and metrics. The only `.delete()` is a coupon-row rollback when a just-created coupon fails to sync | No Space/media/account deletion |
| Customer deletion paths (`configurator/retreat/lifecycleActions.ts`, `(auth)/actions.ts`) | Only run on an explicit, authenticated owner request; refuse a live paid subscription (`decideSpaceDeletion`, trigger `guard_tenant_delete_with_subscription`) | Only on owner request, never from the lifecycle |

Pinned by `app/src/lib/billing/lifecycleNoDelete.test.ts`: it walks every module reachable from the cron route and fails on any delete / Storage remove / `delete_space` / account-deletion call, checks the `BillingStore` method names, checks every definition of `billing_apply_lifecycle` (and of the expiry / next-action functions the job also calls) in every migration for `DELETE`/`TRUNCATE`/`DROP`, forbids `pg_cron`, and runs the job a year past Day 14 through a recording store proxy to prove no delete-like method is called and the Space still exists.

### Retention and recovery workflow (placeholder, not implemented)

**Automatic deletion requires an approved retention and recovery workflow before any automatic deletion.** Until that workflow is written, reviewed and explicitly authorised by a task, eligible Spaces stay intact indefinitely (Studio and Guest App unavailable, content preserved) and can be recovered by paying.

The future workflow must define, at minimum, before any code is written:

1. Owner approval and legal review of the retention period (and per-jurisdiction requirements).
2. A grace/hold period after eligibility and the notice(s) sent before deletion, with the exact localized copy.
3. Recovery: how an owner restores a Space during the hold (payment restores access; no data loss) and what Admin can do.
4. What is deleted (Space rows, published snapshot, Storage media, audio) versus retained (billing_invoices and other financial records, anonymised via `ON DELETE SET NULL`; audit log).
5. Backups: how long deleted data persists in Supabase backups and whether restoration from backup is offered.
6. A dry-run report mode, an Admin review queue with MFA step-up and audit entries, and per-run limits.
7. Changes to `lifecycleNoDelete.test.ts` made deliberately in the same reviewed change.

## Recovery

When a later sync sees status `active`/`trialing` with the latest invoice not failed while an episode is open (typically `invoice.paid`): `payment_failed_at`, guest/studio suspension, warning and eligibility stamps are cleared, `recovered_at` is set, and the single payment confirmation goes out with the `recovered` variant. The customer can fix payment through the Billing Portal button on the Billing page.

## Cancellation and ended subscriptions

- Customer cancel = `cancel_at_period_end` (no automatic refund). `cancellation_scheduled` email once per period end. Access continues to the period end; treated as ended 6h after it (`CANCEL_SLACK_HOURS`) even if the deleted webhook was missed. `subscription_ended` email once.
- Ended means Studio and Guest are unavailable, content is preserved. Deleting a Space with a live paid subscription is refused until it is cancelled (`ACTIVE_SUBSCRIPTION`).
- Failure episodes continue after Stripe itself cancels for non-payment, so the day-12 and day-14 steps still apply.
