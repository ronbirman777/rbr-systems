import type { StripeMode } from "../types";

/**
 * Everything the billing domain needs from Stripe, as PLAIN data. The real
 * implementation (real.ts) is the only code that touches the Stripe SDK; tests
 * use an in-memory fake with the same interface, so checkout, provisioning,
 * reconciliation and webhook handling are testable without a network.
 *
 * Stripe is authoritative for the financial transaction. Nothing here ever
 * receives, returns or stores card data.
 */

/** Stripe subscription statuses we understand (a subset of Stripe's; anything else is rejected). */
export type StripeSubscriptionStatus =
  | "incomplete" | "incomplete_expired" | "trialing" | "active" | "past_due" | "canceled" | "unpaid" | "paused";

export type SubscriptionDTO = {
  id: string;
  customerId: string;
  status: StripeSubscriptionStatus;
  priceId: string | null;
  currency: string;
  /** Recurring list price per cycle (price unit amount x quantity), minor units. */
  baseAmountMinor: number;
  /** Recurring amount after any currently-applying discount, when reliably known. */
  effectiveAmountMinor: number | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  cancelAt: Date | null;
  canceledAt: Date | null;
  endedAt: Date | null;
  latestInvoiceId: string | null;
  /** The latest invoice (without the receipt lookup), so state sync needs one Stripe read. */
  latestInvoice: InvoiceDTO | null;
  /** The Stripe coupon currently attached, if any. */
  discountCouponId: string | null;
  metadata: Record<string, string>;
  livemode: boolean;
};

export type InvoiceStatus = "draft" | "open" | "paid" | "void" | "uncollectible";

export type InvoiceDTO = {
  id: string;
  subscriptionId: string | null;
  customerId: string | null;
  status: InvoiceStatus;
  billingReason: string | null;
  currency: string;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  amountDueMinor: number;
  amountPaidMinor: number;
  number: string | null;
  /** Stripe-HOSTED official document pages. */
  hostedInvoiceUrl: string | null;
  invoicePdfUrl: string | null;
  receiptUrl: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  createdAt: Date | null;
  paidAt: Date | null;
  /** Set when a payment attempt on this invoice failed. */
  failedAt: Date | null;
  attemptCount: number;
  nextPaymentAttemptAt: Date | null;
  discountApplied: boolean;
  livemode: boolean;
};

export type CheckoutSessionDTO = {
  id: string;
  status: "open" | "complete" | "expired";
  paymentStatus: "paid" | "unpaid" | "no_payment_required";
  customerId: string | null;
  subscriptionId: string | null;
  clientReferenceId: string | null;
  metadata: Record<string, string>;
  url: string | null;
  expiresAt: Date | null;
  livemode: boolean;
};

/** A verified (signature-checked) Stripe event, reduced to what routing needs. */
export type StripeEventDTO = {
  id: string;
  type: string;
  livemode: boolean;
  createdAt: Date;
  /** id of the primary object (cs_/sub_/in_/ch_...). */
  objectId: string | null;
  /**
   * Only for charge.refunded / charge.refund.updated: the charge the refund belongs to. The amounts in the event body are
   * a HINT only - the handler re-reads the charge from Stripe (fetch-on-event), so out-of-order partial refunds and a
   * refund that later fails converge on Stripe's current total.
   */
  refund?: { chargeId: string; paymentIntentId: string | null; amountRefundedMinor: number } | null;
};

export type PriceCheck = { ok: true } | { ok: false; reason: string };

export interface StripeGateway {
  readonly mode: StripeMode;

  ensureCustomer(args: { userId: string; email: string | null; existingCustomerId: string | null }): Promise<{ id: string }>;

  /** Price-drift guard: the Stripe Price must match the trusted plan EXACTLY. */
  checkPrice(args: { priceId: string; expectedAmountMinor: number; currency: string; interval: "month" | "year" }): Promise<PriceCheck>;

  createCheckoutSession(args: {
    pendingCheckoutId: string;
    /** Distinguishes attempts for the same pending checkout (previous session id / coupon) so Stripe's 24h idempotency cache never hands back a stale or expired session. */
    attemptKey: string;
    customerId: string;
    priceId: string;
    couponId: string | null;
    successUrl: string;
    cancelUrl: string;
    expiresAt: Date;
    metadata: Record<string, string>;
    locale: string | null;
    automaticTax: boolean;
  }): Promise<CheckoutSessionDTO>;
  expireCheckoutSession(sessionId: string): Promise<void>;
  retrieveCheckoutSession(sessionId: string): Promise<CheckoutSessionDTO>;

  retrieveSubscription(subscriptionId: string): Promise<SubscriptionDTO>;
  setCancelAtPeriodEnd(subscriptionId: string, cancel: boolean): Promise<SubscriptionDTO>;
  retrieveInvoice(invoiceId: string): Promise<InvoiceDTO>;
  /** Refund events: Stripe's CURRENT refund total for a charge (cumulative, partial or full). null = no such charge. */
  retrieveChargeRefund(chargeId: string): Promise<{ paymentIntentId: string | null; amountRefundedMinor: number } | null>;
  /** For charge.refunded: find the invoice a payment belongs to. */
  findInvoiceIdForPaymentIntent(paymentIntentId: string): Promise<string | null>;

  createBillingPortalSession(args: { customerId: string; returnUrl: string }): Promise<{ url: string }>;

  /** Admin: create the Stripe counterpart of an InnerDweS coupon (financial terms are immutable on Stripe). */
  createCoupon(args: {
    internalCouponId: string;
    name: string;
    percentOff: number | null;
    amountOffMinor: number | null;
    currency: string | null;
    duration: "once" | "repeating" | "forever";
    durationInMonths: number | null;
  }): Promise<{ id: string }>;
  /** Consistency verification: read the Stripe coupon back. */
  retrieveCoupon(couponId: string): Promise<{
    id: string; valid: boolean; percentOff: number | null; amountOffMinor: number | null; currency: string | null;
    duration: "once" | "repeating" | "forever"; durationInMonths: number | null;
  } | null>;

  /** Admin: make sure the plan's Stripe Product/Price exist in this mode (idempotent). */
  ensureProductAndPrice(args: {
    planKey: string; displayName: string; amountMinor: number; currency: string; interval: "month" | "year";
    existingProductId: string | null; existingPriceId: string | null;
  }): Promise<{ productId: string; priceId: string }>;

  /** Verify the signature of a webhook delivery. Throws on any invalid signature. */
  verifyWebhook(rawBody: string, signatureHeader: string | null): StripeEventDTO;
}
