# Emails and invoices

## Principle

One coherent experience: **InnerDweS sends exactly one email per verified paid invoice** (the service confirmation). The official document is the Stripe-hosted invoice page and PDF. Stripe's own customer emails must therefore be OFF.

| Who | What |
|---|---|
| InnerDweS (Resend) | `payment_confirmation` per paid invoice, plus notices: `payment_failed`, `guest_unavailable`, `studio_suspended`, `final_warning`, `cancellation_scheduled`, `subscription_ended` |
| Stripe | Hosts the invoice and PDF. Sends nothing (see below) |

## One email per verified paid invoice

- Triggered only from a verified invoice (`processInvoice`), never from a browser redirect.
- Dedupe key `payment_confirmation:<stripe invoice id>`, unique in `billing_email_outbox`. Webhook retries, `invoice.paid` plus `invoice.payment_succeeded`, the provisioning path and reconcile all converge on one row.
- An invoice that arrives before its Space exists is recorded unmapped; provisioning re-runs `processInvoice`, which then queues the single confirmation.
- Variant: `first` (`subscription_create`), `renewal`, `recovered` (the Space was in a failure episode), `final` (cancel at period end set).
- Payload: Space name/type, plan, amount paid, discount, coupon code and cycle, next billing date, next expected charge, invoice number, hosted/PDF/receipt URLs, Billing page URL. Locale = the recipient's stored locale, English fallback.
- `invoice.created/finalized/updated/voided/marked_uncollectible` only record data; they cannot send email.
- `payment_failed` is not sent for the first invoice of a new subscription.

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
