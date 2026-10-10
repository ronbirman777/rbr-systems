import type Stripe from "stripe";
import type { CheckoutSessionDTO, InvoiceDTO, InvoiceStatus, StripeEventDTO, StripeSubscriptionStatus, SubscriptionDTO } from "./gateway";

/**
 * The ONLY file that interprets Stripe SDK object shapes. Everything else in
 * the billing domain sees the plain DTOs from gateway.ts. Mappers are pure and
 * unit-tested with fixture objects; the compiler checks them against the
 * installed SDK's types, so an SDK upgrade that moves a field fails the build
 * here instead of silently corrupting billing state.
 */

const date = (unix: number | null | undefined): Date | null => (typeof unix === "number" ? new Date(unix * 1000) : null);
const idOf = (v: string | { id: string } | null | undefined): string | null => (v == null ? null : typeof v === "string" ? v : v.id);

const SUBSCRIPTION_STATUSES: readonly StripeSubscriptionStatus[] = [
  "incomplete", "incomplete_expired", "trialing", "active", "past_due", "canceled", "unpaid", "paused",
];

/** Coupon id of a Discount, tolerant of the two shapes Stripe has used (`coupon` and `source.coupon`). */
export function couponIdOfDiscount(d: unknown): string | null {
  if (!d || typeof d === "string") return null;
  const o = d as { coupon?: unknown; source?: { coupon?: unknown } };
  const c = o.source?.coupon ?? o.coupon;
  return c == null ? null : typeof c === "string" ? c : ((c as { id?: string }).id ?? null);
}

export function mapSubscription(s: Stripe.Subscription): SubscriptionDTO {
  if (!SUBSCRIPTION_STATUSES.includes(s.status as StripeSubscriptionStatus)) {
    throw new Error(`unsupported Stripe subscription status: ${s.status}`);
  }
  const item = s.items.data[0];
  if (!item) throw new Error("subscription has no items");
  const unit = item.price.unit_amount;
  if (unit == null) throw new Error("subscription price has no fixed unit amount");
  const base = unit * (item.quantity ?? 1);
  // The (basil+) API carries the billing period on the item.
  const periodStart = date((item as unknown as { current_period_start?: number }).current_period_start);
  const periodEnd = date((item as unknown as { current_period_end?: number }).current_period_end);
  const discounts = ((s as unknown as { discounts?: unknown[] }).discounts ?? []);
  const couponId = discounts.map(couponIdOfDiscount).find((x): x is string => !!x) ?? null;
  return {
    id: s.id,
    customerId: idOf(s.customer as string | { id: string })!,
    status: s.status as StripeSubscriptionStatus,
    priceId: item.price.id,
    currency: item.price.currency.toUpperCase(),
    baseAmountMinor: base,
    effectiveAmountMinor: null, // filled by effectiveAmountFromInvoice(); Stripe has no single field for it
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: s.cancel_at_period_end,
    cancelAt: date(s.cancel_at),
    canceledAt: date(s.canceled_at),
    endedAt: date(s.ended_at),
    latestInvoiceId: idOf(s.latest_invoice as string | { id: string } | null),
    latestInvoice: null, // filled by the gateway when it retrieves the invoice
    discountCouponId: couponId,
    metadata: (s.metadata ?? {}) as Record<string, string>,
    livemode: s.livemode,
  };
}

export function mapInvoice(i: Stripe.Invoice): InvoiceDTO {
  const raw = i as unknown as {
    parent?: { subscription_details?: { subscription?: string | { id: string } | null } | null } | null;
    total_taxes?: { amount: number }[] | null;
    total_discount_amounts?: { amount: number }[] | null;
    status_transitions?: { paid_at?: number | null } | null;
    customer?: string | { id: string } | null;
    subscription?: string | { id: string } | null;
    lines?: { data?: { period?: { start?: number | null; end?: number | null } | null; parent?: { type?: string | null } | null }[] } | null;
  };
  const status = (i.status ?? "draft") as InvoiceStatus;
  const discountMinor = (raw.total_discount_amounts ?? []).reduce((a, d) => a + d.amount, 0);
  const taxMinor = (raw.total_taxes ?? []).reduce((a, t) => a + t.amount, 0);
  // Stripe's invoice-level period_start/period_end describe the PREVIOUS (usage) period: on a subscription_cycle invoice
  // they are last month, and on the first invoice both equal the creation time. The period a licensed (pay-in-advance)
  // subscription invoice actually pays for is the subscription line item's period, so that is what is stored.
  const lines = raw.lines?.data ?? [];
  const line = lines.find((l) => l.parent?.type === "subscription_item_details" && l.period) ?? lines.find((l) => l.period) ?? null;
  const periodStart = date(line?.period?.start ?? i.period_start);
  const periodEnd = date(line?.period?.end ?? i.period_end);
  return {
    id: i.id!,
    subscriptionId: idOf(raw.parent?.subscription_details?.subscription ?? raw.subscription ?? null),
    customerId: idOf(raw.customer ?? null),
    status,
    billingReason: i.billing_reason ?? null,
    currency: i.currency.toUpperCase(),
    subtotalMinor: i.subtotal,
    discountMinor,
    taxMinor,
    totalMinor: i.total,
    amountDueMinor: i.amount_due,
    amountPaidMinor: i.amount_paid,
    number: i.number ?? null,
    hostedInvoiceUrl: i.hosted_invoice_url ?? null,
    invoicePdfUrl: i.invoice_pdf ?? null,
    receiptUrl: null,
    periodStart,
    periodEnd,
    createdAt: date(i.created),
    paidAt: date(raw.status_transitions?.paid_at ?? null),
    failedAt: null, // set by the webhook handler from the payment_failed event time
    attemptCount: i.attempt_count ?? 0,
    nextPaymentAttemptAt: date(i.next_payment_attempt),
    discountApplied: discountMinor > 0,
    livemode: i.livemode,
  };
}

export function mapCheckoutSession(s: Stripe.Checkout.Session): CheckoutSessionDTO {
  return {
    id: s.id,
    status: (s.status ?? "open") as CheckoutSessionDTO["status"],
    paymentStatus: s.payment_status as CheckoutSessionDTO["paymentStatus"],
    customerId: idOf(s.customer as string | { id: string } | null),
    subscriptionId: idOf(s.subscription as string | { id: string } | null),
    clientReferenceId: s.client_reference_id ?? null,
    metadata: (s.metadata ?? {}) as Record<string, string>,
    url: s.url ?? null,
    expiresAt: date(s.expires_at),
    livemode: s.livemode,
  };
}

/**
 * The effective (post-discount) recurring amount, when it is reliably known:
 * a PAID/open subscription invoice's total for the cycle. Tax-inclusive totals
 * are not used - we persist the amount BEFORE tax (subtotal - discount), which
 * is what the Billing page labels "before tax".
 */
export function effectiveAmountFromInvoice(inv: Pick<InvoiceDTO, "subtotalMinor" | "discountMinor">): number {
  return Math.max(0, inv.subtotalMinor - inv.discountMinor);
}

/** Reduce a verified Stripe event to the routing DTO (pure; exported for tests). */
export function eventToDto(ev: Pick<Stripe.Event, "id" | "type" | "livemode" | "created"> & { data: { object: unknown } }): StripeEventDTO {
  const obj = ev.data.object as { id?: string; payment_intent?: string | { id: string } | null; amount_refunded?: number; charge?: string | { id: string } | null };
  const ref = (v: string | { id: string } | null | undefined) => (v == null ? null : typeof v === "string" ? v : v.id);
  let refund: StripeEventDTO["refund"] = null;
  if (ev.type === "charge.refunded") {
    refund = { chargeId: obj.id ?? "", paymentIntentId: ref(obj.payment_intent), amountRefundedMinor: obj.amount_refunded ?? 0 };
  } else if (ev.type === "charge.refund.updated") {
    // The object is a Refund (e.g. a refund that FAILED, which lowers the charge's refunded total). Only its charge matters.
    const chargeId = ref(obj.charge);
    refund = chargeId ? { chargeId, paymentIntentId: ref(obj.payment_intent), amountRefundedMinor: 0 } : null;
  }
  return { id: ev.id, type: ev.type, livemode: ev.livemode, createdAt: new Date(ev.created * 1000), objectId: obj.id ?? null, refund };
}
