/**
 * The billing email model: which templates exist, which are retired, which
 * payment-confirmation variant a paid invoice gets, and every dedupe key.
 * (docs/billing/EMAILS-INVOICES.md is the human-readable version of this file.)
 *
 * One customer message per event - never two:
 *   - payment confirmation      -> `payment_confirmation`, ONE per verified paid invoice
 *     (variant `first` | `renewal` | `recovered` | `final`)
 *   - subscription activation    -> the `first` variant of that same email (payment
 *     confirmed AND subscription started). There is no separate welcome email.
 *   - payment recovery           -> the `recovered` variant of that same email.
 *   - failed-payment warning     -> `payment_failed` (renewals only), then the
 *     lifecycle notices `guest_unavailable` / `studio_suspended` / `final_warning`.
 *   - invoice / receipt document -> NOT an email from us: the Stripe-hosted invoice
 *     page / PDF / receipt, linked from the payment confirmation. Stripe's own
 *     customer emails stay OFF.
 */

/** Templates the app enqueues and renders. */
export const EMAIL_TEMPLATES = [
  "payment_confirmation", "payment_failed", "guest_unavailable", "studio_suspended",
  "final_warning", "cancellation_scheduled", "subscription_ended",
] as const;
export type EmailTemplate = (typeof EMAIL_TEMPLATES)[number];

/**
 * Still allowed by the DB check constraint (migrations 0036/0040) for
 * compatibility, but RETIRED: never enqueued, never rendered. A stray row would
 * be marked `skipped` by the outbox, never sent. Sending either would duplicate
 * the payment confirmation the customer already gets for the same invoice.
 */
export const RETIRED_EMAIL_TEMPLATES = {
  subscription_started: "folded into payment_confirmation variant 'first'",
  payment_recovered: "folded into payment_confirmation variant 'recovered'",
} as const;
export type RetiredEmailTemplate = keyof typeof RETIRED_EMAIL_TEMPLATES;

export const isSendableTemplate = (t: string): t is EmailTemplate => (EMAIL_TEMPLATES as readonly string[]).includes(t);
export const isRetiredTemplate = (t: string): t is RetiredEmailTemplate => Object.hasOwn(RETIRED_EMAIL_TEMPLATES, t);

export type PaymentVariant = "first" | "renewal" | "recovered" | "final";

/**
 * The single variant a paid invoice's confirmation gets. Precedence:
 *   1. `first`     - the subscription's first invoice: confirmation + activation;
 *   2. `final`     - cancellation is scheduled: states the end date, no next charge;
 *   3. `recovered` - the Space was in a payment-failure episode: "active again";
 *   4. `renewal`.
 * Exactly one variant per invoice; the dedupe key below makes it one row.
 */
export function paymentConfirmationVariant(a: { billingReason: string | null; wasInFailure: boolean; cancelAtPeriodEnd: boolean }): PaymentVariant {
  if (a.billingReason === "subscription_create") return "first";
  if (a.cancelAtPeriodEnd) return "final";
  if (a.wasInFailure) return "recovered";
  return "renewal";
}

/**
 * Every dedupe key (UNIQUE in billing_email_outbox; enqueue is ON CONFLICT DO
 * NOTHING). Per invoice or per subscription episode, so duplicate webhooks,
 * provisioning/reconcile re-runs and re-run jobs converge on one row.
 */
export const emailDedupeKey = {
  /** Per Stripe invoice: covers first / renewal / recovered / final. */
  paymentConfirmation: (stripeInvoiceId: string) => `payment_confirmation:${stripeInvoiceId}`,
  /** Per Stripe invoice: the first observed failure of that invoice. */
  paymentFailed: (stripeInvoiceId: string) => `payment_failed:${stripeInvoiceId}`,
  /** Per subscription failure episode (keyed by its start), so a NEW episode notifies again. */
  lifecycle: (template: "guest_unavailable" | "studio_suspended" | "final_warning", subscriptionId: string, paymentFailedAt: Date | null) =>
    `${template}:${subscriptionId}:${paymentFailedAt?.toISOString() ?? "na"}`,
  /** Per Stripe subscription and scheduled end date (re-scheduling after a resume notifies again). */
  cancellationScheduled: (stripeSubscriptionId: string, periodEndIso: string | null) => `cancellation_scheduled:${stripeSubscriptionId}:${periodEndIso}`,
  /** Once per Stripe subscription. */
  subscriptionEnded: (stripeSubscriptionId: string) => `subscription_ended:${stripeSubscriptionId}`,
} as const;
