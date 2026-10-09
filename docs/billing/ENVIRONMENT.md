# Billing environment

Names only. No values belong in this repository or in these docs.

## Variables read by billing code

| Name | Used by | Purpose | Required for |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | `deps.server.ts`, `stripe/mode.ts` | Stripe API key. Its prefix (`sk_`/`rk_` + `test_`/`live_`) **is** the Stripe mode | Checkout, webhook, cron work, Admin sync |
| `STRIPE_WEBHOOK_SECRET` | `stripe/real.ts` | Verifies the webhook signature for this mode | Webhook (without it every webhook fails verification, 400) |
| `STRIPE_AUTOMATIC_TAX` | `deps.server.ts` | Exactly the string `true` turns on Stripe automatic tax in Checkout; anything else is off | Tax (see TAX.md) |
| `CRON_SECRET` | `api/cron/billing/route.ts` | Bearer token Vercel Cron sends. Unset: route answers 503 and nothing can authorise a run | Scheduled job |
| `RESEND_API_KEY` | `getEmailSender()` | Billing email provider | Sending emails |
| `BILLING_EMAIL_FROM` | `getEmailSender()` | Sender address | Sending emails |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` | Supabase clients; billing uses the service-role (secret) client | Everything |
| `NEXT_PUBLIC_APP_URL` (via `APP_URL`) | `deps.appUrl`: Checkout success/cancel URLs and email links | Checkout |
| `INNERDWES_PREVIEW_PASSWORD` | Preview gate; webhook and cron paths are exempt by exact path | Gate |

QA-only (never in deployed config): `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `APP_BASE`, `PLAYWRIGHT_PATH`, `VERCEL_BYPASS`, `ADMIN_QA_STEPUP`, `ADMIN_QA_DUMP`, `ADMIN_QA_CSS`, `STAGING_BILLING_INTEGRATION`, `REAL_STACK_*`.

## Behaviour when variables are missing

| Missing | Result |
|---|---|
| `STRIPE_SECRET_KEY` | `isStripeConfigured()` false. Create flow: legacy if flag off, `unavailable` if flag on. Webhook 503. Cron answers `{skipped: "stripe not configured"}` |
| `STRIPE_WEBHOOK_SECRET` | `verifyWebhook` throws, webhook returns 400 |
| `CRON_SECRET` | Cron 503 `cron not configured` (fails closed) |
| `RESEND_API_KEY` or `BILLING_EMAIL_FROM` | No sender; outbox rows stay `pending`; job reports `emails.skipped: true` |
| `STRIPE_AUTOMATIC_TAX` | Automatic tax off |

## Test vs Live separation

- Mode is derived from the key prefix only; there is no separate setting that could disagree.
- Every stored Stripe id carries `stripe_mode`; uniqueness is per mode (customers, subscriptions, sessions, events, invoices). Plans and coupons keep separate `stripe_test_*` / `stripe_live_*` columns.
- A webhook whose `livemode` differs from the key's mode is rejected. `provisionFromVerifiedSession` rejects a pending checkout whose mode differs (`wrong_mode`).
- Test and Live need their own webhook endpoint secret, product/price (Admin "sync plan" per mode) and coupon sync (Admin "sync coupon" per mode).
- Rule: a Test key must never be configured on Production, and a Live key never on Staging or Preview.

## Staging vs Production

| | Staging | Production |
|---|---|---|
| Supabase project | ref `kkqjsspxupyxytddiumf` (hard-coded in `scripts/stagingGuard.mjs`) | ref `qzmsclkzbxrfohuxnitc` (named in the guard only as a thing to refuse) |
| Deploy | `vercel deploy --target=staging` from repo root (per project memory) | Pushing `main` auto-deploys Production; needs the task's release gate |
| Stripe mode intended | Test | Live, only after LAUNCH-GATES.md passes |
| Paid checkout flag | OFF | OFF |

## What is currently NOT configured on Staging

As reported by the task owner; not independently verified by this document (no Vercel env was read):

- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_AUTOMATIC_TAX`: not set. Consequence: no Stripe Test checkout, webhook or Admin plan/coupon sync can run on Staging yet; the funnel falls to legacy because the flag is off.
- `RESEND_API_KEY`, `BILLING_EMAIL_FROM`: not set. Emails would only queue.
- `CRON_SECRET`: not set. The cron route would answer 503 even though `vercel.json` schedules it.

Consequently the Stripe-dependent paths are verified in this repo only by unit tests with a fake gateway (`testing/fakeGateway.ts`, `fakeStore.ts`) and by database-level checks on Staging (`scripts/billing-db-verify.mjs`); no real Stripe round trip is evidenced here.
