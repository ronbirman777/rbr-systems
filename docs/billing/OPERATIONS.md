# Operations runbooks

Admin overview (`/admin/billing`) shows counts of open checkouts, failed events and stuck checkouts. Read-only inspection first; any database mutation outside the Admin console is a Supabase mutation and needs explicit task authorisation. Never print secrets or customer data into tickets.

## The scheduled job

`/api/cron/billing`, `vercel.json` schedule `*/15 * * * *`, authorised by `Authorization: Bearer $CRON_SECRET` (timing-safe compare). 503 if `CRON_SECRET` is unset; 401 on a wrong token; `{skipped}` if Stripe is unconfigured. Steps, each guarded so one failing step does not stop the others (errors land in `report.errors`, truncated to 160 chars):

| Step | What |
|---|---|
| expire | `billing_expire_open_checkouts` (open checkouts past `expires_at` become `expired`, reservations released) and `billing_expire_stale_reservations` |
| reconcile | Up to 50 checkouts that are `payment_confirmed`/`provisioning`/`failed`, or `checkout_created`/`awaiting_payment` untouched for 2 minutes, and have a session id: `reconcileCheckout` |
| resync | Up to 50 active/trialing/past_due/unpaid subscriptions whose `current_period_end` is more than 2h in the past: re-fetch from Stripe and apply |
| lifecycle | `billing_apply_lifecycle`, enqueue the matching email, refresh next action |
| emails | `flushEmailOutbox` (20 per run) if a sender is configured |

Safe at any frequency and safe to trigger manually (same bearer secret; do not paste the secret anywhere).

### Cron not running
1. Confirm `CRON_SECRET` exists on that environment (name check only). Without it the route answers 503 even if Vercel fires it.
2. Check Vercel Cron logs for the path; a 401 means the secret differs from what Vercel injects.
3. After fixing, the next run catches up: every step is derived from current state, not from run history.

## Stuck webhook (event `failed`, or `processing` forever)

Symptoms: Admin "failed events" count > 0; customer paid but no Space; subscription state stale.
1. In Stripe, confirm delivery status for the event id and that the endpoint secret matches this mode.
2. Inspect the `billing_events` row (status, `error_code`, `attempts`). `rejected:` codes (`metadata_mismatch`, `wrong_mode`, `checkout_not_found`) are permanent: fix the cause (wrong-mode endpoint or key), do not retry blindly.
3. A `processing` claim older than 5 minutes is re-claimed automatically on the next delivery. A `failed` event is re-claimed when Stripe retries or when you resend it from the Stripe dashboard.
4. The state itself does not need the event: use **Resync** (subscription detail, audited `subscription.resync`) or reconcile the checkout below. Both re-read Stripe.

## Customer paid, no Space (stuck checkout)

1. Find the pending checkout (`payment_confirmed`, `provisioning`, `failed`, or old `awaiting_payment`).
2. Run Admin reconcile (`reconcileCheckoutAction`, audited `checkout.reconcile`) or wait for the cron. It retrieves the session from Stripe and calls the same idempotent provisioning; repeat calls return the same tenant.
3. If it keeps failing with `provision_error`, the transaction rolled back (nothing partial exists); read the `failure_code` and the Vercel function log, fix, reconcile again.
4. If Stripe shows the session unpaid, nothing is provisioned and nothing is owed.
5. The customer's success page polls `/api/billing/checkout-status` and reconciles itself at most every 8 seconds; after 25 seconds it says "still working", never "failed".

## Stuck outbox

Symptoms: `billing_email_outbox` rows `pending`/`failed`/`sending` for long; customers report missing emails.
1. If no `RESEND_API_KEY`/`BILLING_EMAIL_FROM`: rows stay `pending` by design; set them, the next run sends.
2. `sending` rows are re-leased after 10 minutes (own `claimed_at`); rows give up after 5 attempts (`attempts < 5`) and stay `failed` with `last_error` (<= 300 chars).
3. `skipped` = unsupported template or no recipient address (not an error to retry).
4. Resend sees an `Idempotency-Key` per row, so retrying cannot double-send within Resend's window.
5. Never reset `dedupe_key`s to force a resend; that is how duplicates are created. A genuinely lost email is re-sent by a human with explicit authorisation.

## Reconcile and resync (summary)

| Need | Tool | Effect |
|---|---|---|
| Space missing after payment | Admin reconcile checkout | Retrieve session, provision idempotently |
| Subscription status/amounts look wrong | Admin resync subscription | Re-fetch from Stripe, apply, refresh next action |
| Lifecycle stamps look wrong | Wait for / trigger cron | `billing_apply_lifecycle` is deterministic |
| Wrong Stripe mode data | Do not edit rows; fix key/endpoint; rows are mode-scoped | - |

## Other

- **Price drift** (`price_drift:*` on checkout or enabling the flag): the Stripe Price no longer equals the plan row. Fix in Stripe or re-run Admin "sync plan"; never edit the plan to match a stray price without a decision.
- **Rollback of paid checkout**: set the flag to false in Admin. Paid Spaces keep operating.
- **Unknown subscription** (`unknown_subscription` result): an event for a subscription with no local row, normally a race before provisioning; reconcile the checkout.
