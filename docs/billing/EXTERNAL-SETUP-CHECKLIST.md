# TASK 032 — External integration setup checklist (owner actions)

Status: the code is ready for integration testing. External services are **not connected**. No Stripe account exists yet, and none was created or configured on the owner's behalf.
Everything here is **Test Mode / Staging only**. Never put a Live key on Staging/Preview, or a Test key on Production.

## 0. Readiness: code vs external integration

| Area | Code readiness (verified in repo / Staging DB) | External integration readiness |
|---|---|---|
| Checkout + provisioning | Unit tests, a fake-gateway integration over the real Staging DB (10 journeys) and the DB harness (146 checks) | **Not tested.** Needs a Stripe Test account |
| Webhook | Signature verification, idempotency, fetch-on-event and mode checks are unit-tested | **Not tested.** Needs an endpoint and a signing secret |
| Coupons → Stripe sync | Unit-tested with the fake gateway | **Not tested** |
| Invoices / payment history | Unit and DB-tested | **Not tested** with Stripe-hosted documents |
| Emails (outbox) | Enqueue, dedupe and render are tested; the sender is fail-safe when unconfigured | **Not tested.** No Resend account, key or domain |
| Scheduled job | Route and lifecycle logic tested; fails closed without `CRON_SECRET` | **Not tested** on a schedule |
| Admin + MFA | Real-browser QA on Staging (TOTP, AAL2, gates) | Stripe-dependent Admin actions (plan/coupon sync) untested |

Fake-Stripe tests do **not** replace real Stripe Test Mode integration.

## 1. Stripe (Test Mode) — owner must do

| # | Action | Where |
|---|---|---|
| S1 | Create a Stripe account. Stay in **Test mode** (toggle in the Dashboard); do not activate Live payments | dashboard.stripe.com |
| S2 | Create a **restricted** or standard **test** secret key (`rk_test_…` / `sk_test_…`). Restricted key permissions: Checkout Sessions write, Customers write, Subscriptions write, Prices/Products write, Coupons/Promotion codes write, Invoices read, Charges/PaymentIntents read, Billing Portal write, Events read | Dashboard → Developers → API keys |
| S3 | Put it in Vercel env **`STRIPE_SECRET_KEY`**, environment **`staging` only** | Vercel → Project innerdwes → Settings → Environment Variables |
| S4 | Give Staging a **stable URL** for webhooks (deployment URLs change each deploy). Either a Vercel alias/domain for the `staging` environment, or the staging branch URL. A custom domain is a DNS change and needs its own authorization | Vercel → Domains |
| S5 | Deployment Protection blocks Stripe. Create a *Protection Bypass for Automation* secret and append it to the webhook URL as `?x-vercel-protection-bypass=<secret>`. Alternative: disable protection for the staging domain only | Vercel → Settings → Deployment Protection |
| S6 | Add a webhook endpoint `https://<staging-stable-host>/api/billing/webhook[?x-vercel-protection-bypass=…]` in **Test mode**, subscribed to exactly the events listed below | Dashboard → Developers → Webhooks |
| S7 | Copy that endpoint's signing secret (`whsec_…`) into Vercel **`STRIPE_WEBHOOK_SECRET`** (`staging` only) | Vercel env |
| S8 | `STRIPE_AUTOMATIC_TAX`: leave unset (off) until tax treatment is decided (TAX.md). For testing Stripe Tax, set `true` only after enabling Tax in Test mode | Vercel env / Dashboard → Tax |
| S9 | Customer Portal (Test mode): enable payment-method update and invoice history; cancellation **at period end** only; no plan switching | Dashboard → Settings → Billing → Customer portal |
| S10 | Subscriptions & emails (Test mode): Smart Retries on, **after all retries fail → mark subscription unpaid** (not cancel). Turn **off** Stripe's own customer emails for successful payments/receipts and failed payments (InnerDweS sends exactly one email per event) | Dashboard → Settings → Billing → Subscriptions and emails; Settings → Customer emails |
| S11 | Do **not** create the Product/Price or coupons by hand. After S3–S7 and a redeploy, the InnerDweS Admin (MFA) → Settings → **Sync plan** creates the test Product + recurring $25/month Price and stores `stripe_test_*` ids. Coupons are created and synced from Admin → Coupons | InnerDweS Admin on Staging |

Webhook events to subscribe to (see STRIPE-MAPPING.md):
`checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`,
`customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`, `customer.subscription.pending_update_applied`,
`invoice.paid`, `invoice.payment_succeeded`, `invoice.payment_failed`, `invoice.finalized`, `invoice.updated`, `invoice.voided`, `invoice.marked_uncollectible`, `invoice.created`,
`charge.refunded`.

## 2. Resend — owner must do

| # | Action | Where |
|---|---|---|
| R1 | Create a Resend account | resend.com |
| R2 | Add and verify a sending domain (SPF/DKIM DNS records). This is a DNS change and needs owner authorization. A subdomain such as `mail.innerdwes.com` is recommended | Resend → Domains + DNS registrar |
| R3 | Turn **open and click tracking OFF** for that domain | Resend → Domains → settings |
| R4 | Create an API key with **sending access only**, restricted to that domain → Vercel **`RESEND_API_KEY`** (`staging` only) | Resend → API keys; Vercel env |
| R5 | Set Vercel **`BILLING_EMAIL_FROM`** to an address on the verified domain, e.g. `InnerDweS Billing <billing@mail.innerdwes.com>` (`staging`) | Vercel env |
| R6 | Safe recipients: Staging test customers must use owner-controlled inboxes (plus-addressing) or Resend test addresses (`delivered@resend.dev`). Never real customers | QA data |

## 3. Scheduled job — owner must do

| # | Action | Where |
|---|---|---|
| C1 | Generate a long random secret → Vercel **`CRON_SECRET`** (separate values for `staging` and Production) | Vercel env |
| C2 | Vercel Cron runs **only on Production** deployments. On Staging, trigger the job manually: `curl -H "Authorization: Bearer $CRON_SECRET" https://<staging>/api/cron/billing` (plus the bypass parameter), or use an external scheduler with the same header | terminal / scheduler |
| C3 | Failure monitoring: watch Vercel function logs for `/api/cron/billing` non-200 responses, plus Admin → Payments/Audit for failed events. The job is idempotent: re-runs and retries are safe (dedupe keys, guarded transitions, leases) | Vercel → Logs |

## 4. Safe verification order (after S1–S11, R1–R6, C1)

1. Redeploy Staging with the new environment variables. Confirm in Admin → Settings that the Stripe mode shows **test**, and that no `sk_live`/`rk_live` key is present anywhere.
2. Admin → Sync plan (step-up MFA). Check that the Stripe Dashboard shows the Product and Price in **Test mode**.
3. Send a test webhook from the Dashboard ("Send test event"). Expected: 200 `ignored`/handled, and a row in `billing_events`.
4. Turn on `paid_checkout_enabled` **on Staging only** (Admin, step-up). Production stays off.
5. Run the journeys below with Stripe test cards (`4242…`, `4000 0000 0000 0341` for an attach-then-fail card, `4000 0025 0000 3155` for 3DS). Use **Test Clocks** for renewal, discount expiry and the failed-payment timeline (24h, 7d, 12d, 14d) instead of waiting.
6. After each journey, compare Stripe ids, invoice state, `space_subscriptions` state, `billing_invoices`, `billing_email_outbox` and `admin_audit_log`.
7. When finished, turn the Staging flag off again and run the run-scoped cleanup.

## 5. Tests blocked until Stripe / Resend / scheduler are connected

1. Full-price Teach purchase.
2. Full-price Flow purchase.
3. Coupon usable once per user.
4. Coupon usable once per Space.
5. Coupon unlimited during its validity, across several Spaces.
6. Checkout abandoned before payment.
7. Delayed webhook.
8. Duplicate webhook.
9. Exactly one Space per payment.
10. Coupon expiry kept separate from discount duration.
11. Renewal.
12. Discount ends and the price moves to full.
13. Failed payment.
14. Guest App suspended after 24h.
15. Studio suspended at day 7.
16. Day-12 warning.
17. Day-14 deletion eligibility, with no destruction.
18. Recovery.
19. Cancel at period end.
20. Next-action and next-charge views.

Also blocked:
- Stripe-hosted invoice/receipt links.
- Billing History matching Admin Payments against real invoices.
- Actual email delivery and sender/tracking checks.
- Customer Portal success paths (update payment method, cancel/resume through Stripe).
- Stripe coupon/promotion-code sync without drift.
- Scheduled-job execution on a schedule.

## 6. Still blocking a paid launch even after Test Mode passes

- Legal operator/issuer, tax treatment and final legal texts.
- Native-language review.
- Listening-quota metering (see ENTITLEMENTS.md).
- Live-mode configuration (a separate checklist at release time).
