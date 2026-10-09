# Emails and invoices

## Principle

One coherent experience: **one customer email per billing event, never two**. For a verified paid invoice that is exactly one email from InnerDweS, `payment_confirmation`, whose variant also covers subscription activation and payment recovery. The official document is the Stripe-hosted invoice page and PDF. Stripe's own customer emails must therefore be OFF.

| Who | What |
|---|---|
| InnerDweS (Resend) | `payment_confirmation` per paid invoice (variants `first`, `renewal`, `recovered`, `final`), plus notices: `payment_failed`, `guest_unavailable`, `studio_suspended`, `final_warning`, `cancellation_scheduled`, `subscription_ended` |
| Stripe | Hosts the invoice and PDF. Sends nothing (see below) |

The model lives in code in `app/src/lib/billing/emails/templates.ts` (template list, retired list, variant precedence, every dedupe key).

## The five things a customer can be told about money

| Concept | How it reaches the customer | Template / variant | Dedupe key |
|---|---|---|---|
| Payment confirmation | Our email, one per verified paid invoice | `payment_confirmation` (`renewal`; `final` when cancellation is scheduled) | `payment_confirmation:<stripe invoice id>` |
| Subscription activation / welcome | **The same email** for the subscription's first invoice: "payment confirmed, subscription started, Space active". No separate welcome email | `payment_confirmation` variant `first` | `payment_confirmation:<stripe invoice id>` |
| Invoice / receipt document | **Not an email from us.** The Stripe-hosted invoice page / PDF / receipt, linked from the confirmation ("View invoice / receipt") | none | none |
| Failed-payment warning | Our email on the first observed failure of a renewal invoice (never for the first invoice of a new subscription), then the scheduled lifecycle notices | `payment_failed`; then `guest_unavailable` (+24h), `studio_suspended` (+7d), `final_warning` (+12d) | `payment_failed:<stripe invoice id>`; `<template>:<subscription id>:<failure episode start>` |
| Payment recovery | **The same confirmation email** for the paid invoice that ends a failure episode: "payment received, Space active again". No separate recovery email | `payment_confirmation` variant `recovered` | `payment_confirmation:<stripe invoice id>` |

Other notices: `cancellation_scheduled` (`cancellation_scheduled:<stripe subscription id>:<period end>`), `subscription_ended` (`subscription_ended:<stripe subscription id>`).

### Variant precedence (one variant per invoice)

1. `first` - `billing_reason = subscription_create` (always the activation email, even if a cancellation were already scheduled; the next-charge rows are then omitted).
2. `final` - cancel-at-period-end is set: states the end date, no next-charge rows.
3. `recovered` - the Space was in a payment-failure episode when the paid invoice was processed.
4. `renewal` - everything else.

The variant is decided when the row is first queued; the dedupe key means a later redelivery (when the Space is no longer in failure) cannot add a second row or change it. Known limit: if the very first processing of a recovering invoice crashes after the subscription state was applied but before the row was queued, the retry sees no open failure and queues the `renewal` variant. The customer still gets exactly one email.

### Retired templates

`subscription_started` and `payment_recovered` are still allowed by the `billing_email_outbox_template_check` constraint (migrations 0036, 0040). They are **retired**: no migration is needed or planned, the app never enqueues them (`enqueueSimpleNotice` refuses them at runtime as well as by type), nothing renders them, and a stray row is marked `skipped` with `last_error = 'retired template'` by the outbox. Sending either would duplicate the `payment_confirmation` the customer already receives for the same invoice. A future migration may drop them from the check once no environment holds such rows.

## One email per verified paid invoice

- Triggered only from a verified invoice (`processInvoice`), never from a browser redirect.
- Dedupe key `payment_confirmation:<stripe invoice id>`, unique in `billing_email_outbox`. Webhook retries, `invoice.paid` plus `invoice.payment_succeeded`, the provisioning path and reconcile all converge on one row.
- An invoice that arrives before its Space exists is recorded unmapped; provisioning re-runs `processInvoice`, which then queues the single confirmation (variant `first`).
- Payload: variant, Space name/type, plan, amount paid, discount, coupon code and cycle, next billing date, next expected charge, subscription status, invoice number, hosted/PDF/receipt URLs, Billing page URL. Locale = the recipient's stored locale, English fallback.
- `invoice.created/finalized/updated/voided/marked_uncollectible` only record data; they cannot send email.
- `payment_failed` is not sent for the first invoice of a new subscription.
- Lifecycle notices are queued by the scheduled job; re-running the job any number of times queues each notice once per failure episode (a new episode after a recovery notifies again).
- Copy for every variant exists in all seven locales (`billing.{en,de,es,fr,he,tr,it}.ts`, keys `emailPayment*`); non-English copy is UNREVIEWED by native speakers.
- Tests: `app/src/lib/billing/emails/emailModel.test.ts` asserts the exact outbox rows for first payment, renewal, failure then recovery, duplicate webhooks, provisioning re-run and re-run lifecycle jobs. Delivery itself is not verified: no Resend credentials are configured, so nothing has been sent to a real mailbox.

## Stripe receipts and customer emails must be OFF

This is a **manual Stripe Dashboard setting** that code cannot enforce or verify: Settings > Billing > Emails (invoice/receipt emails to customers, failed-payment emails) and the receipt email setting, in **both Test and Live**. If left on, customers get two emails per payment. Record the check in the launch checklist (LAUNCH-GATES.md). Whether it is currently off on any Stripe account was not verified (no Stripe account is configured on Staging).

## Tracking is off

- The renderer emits no tracking pixels and no click-redirect wrappers; links are plain destinations, and only `https:` URLs are emitted (`safeHttpsUrl`).
- Every dynamic value is HTML-escaped; Hebrew gets `dir="rtl"`; Space names and coupon codes are never translated.
- Resend open/click tracking is a **domain-level setting** the sender does not control. It must be disabled on the sending domain in Resend. Not verified here (Resend is not configured on Staging).
- Provider call uses plain HTTPS `fetch` with `Idempotency-Key: idw-billing-email-<outbox id>`.

## Invoice storage

`billing_invoices` mirrors Stripe: ids, status (`draft|open|paid|void|uncollectible`), amounts in minor units (subtotal, discount, tax, total, due, paid, refunded), period, Stripe's own `invoice_number`, and the Stripe URLs. Never card numbers, CVC, bank or raw payment-method data. Status never regresses (paid stays paid, void stays void). The billing owner reads their own rows (RLS); Admin reads via service role behind MFA.

The legal issuer, numbering and whether the document is legally an "invoice", "tax invoice" or "receipt" come from the Stripe account configuration and remain part of the legal/tax gate (LAUNCH-GATES.md, TAX.md).
