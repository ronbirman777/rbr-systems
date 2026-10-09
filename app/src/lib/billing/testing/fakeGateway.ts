import type {
  CheckoutSessionDTO, InvoiceDTO, PriceCheck, StripeEventDTO, StripeGateway, StripeSubscriptionStatus, SubscriptionDTO,
} from "../stripe/gateway";

/**
 * A faithful in-memory Stripe for tests: it holds customers, checkout sessions,
 * subscriptions, invoices and coupons, and can SCRIPT what Stripe does in the
 * real world (customer pays, renewal, failed renewal, recovery, cancel-at-period-end).
 * It implements the same StripeGateway interface as the real gateway, so the services
 * under test cannot tell the difference.
 */
export class FakeStripe implements StripeGateway {
  readonly mode = "test" as const;
  price = { id: "price_fake_1", amountMinor: 2500, currency: "USD", interval: "month" as "month" | "year", active: true };
  customers = new Map<string, { id: string; userId: string }>();
  sessions = new Map<string, CheckoutSessionDTO & { priceId: string; couponId: string | null; attemptKey: string }>();
  subs = new Map<string, SubscriptionDTO>();
  invoices = new Map<string, InvoiceDTO>();
  coupons = new Map<string, { id: string; valid: boolean; percentOff: number | null; amountOffMinor: number | null; currency: string | null; duration: "once" | "repeating" | "forever"; durationInMonths: number | null }>();
  couponOfSub = new Map<string, string>();
  cyclesPaid = new Map<string, number>();
  now = new Date("2026-11-01T12:00:00.000Z");
  private n = 0;
  /** Embedded in every fake Stripe id so a test run's rows are identifiable by an exact run id (never a bare prefix). Alphanumeric only. */
  constructor(private readonly idTag = "") {}
  calls: string[] = [];
  /** Test switch: make every Stripe API call throw (outage). */
  down = false;

  private id(prefix: string) { return `${prefix}_FAKE${this.idTag}${++this.n}`; }
  private guard(name: string) { this.calls.push(name); if (this.down) throw new Error("stripe unavailable"); }
  private clone<T>(v: T): T { return structuredClone(v); }

  async ensureCustomer(a: { userId: string; email: string | null; existingCustomerId: string | null }) {
    this.guard("ensureCustomer");
    if (a.existingCustomerId) return { id: a.existingCustomerId };
    const existing = [...this.customers.values()].find((c) => c.userId === a.userId);
    if (existing) return { id: existing.id };
    const c = { id: this.id("cus"), userId: a.userId };
    this.customers.set(c.id, c);
    return { id: c.id };
  }

  async checkPrice(a: { priceId: string; expectedAmountMinor: number; currency: string; interval: "month" | "year" }): Promise<PriceCheck> {
    this.guard("checkPrice");
    if (!this.price.active) return { ok: false, reason: "price_inactive" };
    if (this.price.amountMinor !== a.expectedAmountMinor) return { ok: false, reason: "amount_mismatch" };
    if (this.price.currency !== a.currency.toUpperCase()) return { ok: false, reason: "currency_mismatch" };
    if (this.price.interval !== a.interval) return { ok: false, reason: "interval_mismatch" };
    return { ok: true };
  }

  async createCheckoutSession(a: Parameters<StripeGateway["createCheckoutSession"]>[0]) {
    this.guard("createCheckoutSession");
    // Stripe's idempotency key cache: same key => same session.
    const dup = [...this.sessions.values()].find((s) => s.clientReferenceId === a.pendingCheckoutId && s.attemptKey === a.attemptKey);
    if (dup) return this.clone(dup);
    const s = {
      id: this.id("cs_test"), status: "open" as const, paymentStatus: "unpaid" as const, customerId: a.customerId, subscriptionId: null,
      clientReferenceId: a.pendingCheckoutId, metadata: { ...a.metadata }, url: `https://checkout.stripe.com/c/pay/${this.n}`,
      expiresAt: a.expiresAt, livemode: false, priceId: a.priceId, couponId: a.couponId, attemptKey: a.attemptKey,
    };
    this.sessions.set(s.id, s);
    return this.clone(s);
  }
  async expireCheckoutSession(id: string) { this.guard("expireCheckoutSession"); const s = this.sessions.get(id); if (s && s.status === "open") s.status = "expired"; }
  async retrieveCheckoutSession(id: string) { this.guard("retrieveCheckoutSession"); const s = this.sessions.get(id); if (!s) throw new Error("no such session"); return this.clone(s); }

  async retrieveSubscription(id: string) {
    this.guard("retrieveSubscription");
    const s = this.subs.get(id); if (!s) throw new Error("no such subscription");
    const out = this.clone(s);
    out.latestInvoice = out.latestInvoiceId ? this.clone(this.invoices.get(out.latestInvoiceId)!) : null;
    if (out.latestInvoice) out.effectiveAmountMinor = Math.max(0, out.latestInvoice.subtotalMinor - out.latestInvoice.discountMinor);
    return out;
  }
  async setCancelAtPeriodEnd(id: string, cancel: boolean) {
    this.guard("setCancelAtPeriodEnd");
    const s = this.subs.get(id)!; s.cancelAtPeriodEnd = cancel; s.cancelAt = cancel ? s.currentPeriodEnd : null;
    return this.clone(s);
  }
  async retrieveInvoice(id: string) { this.guard("retrieveInvoice"); const i = this.invoices.get(id); if (!i) throw new Error("no such invoice"); return this.clone(i); }
  async findInvoiceIdForPaymentIntent(pi: string) { this.guard("findInvoice"); return [...this.invoices.keys()].find((k) => k.includes(pi)) ?? null; }
  async createBillingPortalSession() { this.guard("portal"); return { url: "https://billing.stripe.com/p/session/fake" }; }

  async createCoupon(a: Parameters<StripeGateway["createCoupon"]>[0]) {
    this.guard("createCoupon");
    const id = this.id("coupon");
    this.coupons.set(id, { id, valid: true, percentOff: a.percentOff, amountOffMinor: a.amountOffMinor, currency: a.currency, duration: a.duration, durationInMonths: a.durationInMonths });
    return { id };
  }
  async retrieveCoupon(id: string) { this.guard("retrieveCoupon"); const c = this.coupons.get(id); return c ? { ...c } : null; }
  async ensureProductAndPrice(a: { existingProductId: string | null; existingPriceId: string | null }) {
    this.guard("ensureProductAndPrice");
    return { productId: a.existingProductId ?? "prod_FAKE", priceId: a.existingPriceId ?? this.price.id };
  }

  verifyWebhook(rawBody: string, signatureHeader: string | null): StripeEventDTO {
    if (signatureHeader !== "t=1,v1=valid") throw new Error("invalid signature");
    const b = JSON.parse(rawBody) as { id: string; type: string; objectId?: string; created?: number; refund?: StripeEventDTO["refund"] };
    return { id: b.id, type: b.type, livemode: false, createdAt: new Date((b.created ?? this.now.getTime() / 1000) * 1000), objectId: b.objectId ?? null, refund: b.refund ?? null };
  }

  // ---------------------------------------------------------------- scripting the real world
  /** The customer completes Stripe Checkout and pays (optionally with the session's coupon applied). */
  completePayment(sessionId: string): { subscriptionId: string; invoiceId: string } {
    const s = this.sessions.get(sessionId)!;
    s.status = "complete"; s.paymentStatus = "paid";
    const subId = this.id("sub");
    s.subscriptionId = subId;
    if (s.couponId) this.couponOfSub.set(subId, s.couponId);
    const start = new Date(this.now);
    const end = new Date(start.getTime() + 30 * 86400_000);
    const sub: SubscriptionDTO = {
      id: subId, customerId: s.customerId!, status: "active", priceId: s.priceId, currency: "USD", baseAmountMinor: this.price.amountMinor,
      effectiveAmountMinor: null, currentPeriodStart: start, currentPeriodEnd: end, cancelAtPeriodEnd: false, cancelAt: null, canceledAt: null,
      endedAt: null, latestInvoiceId: null, latestInvoice: null, discountCouponId: s.couponId, metadata: { ...s.metadata }, livemode: false,
    };
    this.subs.set(subId, sub);
    const inv = this.issueInvoice(subId, "subscription_create", "paid");
    return { subscriptionId: subId, invoiceId: inv.id };
  }

  /** Does the coupon still discount this subscription's NEXT invoice? */
  private discountFor(subId: string): number {
    const couponId = this.couponOfSub.get(subId);
    const c = couponId ? this.coupons.get(couponId) : null;
    if (!c) return 0;
    const paid = this.cyclesPaid.get(subId) ?? 0;
    const limit = c.duration === "once" ? 1 : c.duration === "repeating" ? c.durationInMonths! : Infinity;
    if (paid >= limit) return 0;
    const base = this.price.amountMinor;
    return c.percentOff != null ? Math.round((base * c.percentOff) / 100) : Math.min(base, c.amountOffMinor ?? 0);
  }

  issueInvoice(subId: string, reason: "subscription_create" | "subscription_cycle", status: "paid" | "open"): InvoiceDTO {
    const sub = this.subs.get(subId)!;
    const discount = this.discountFor(subId);
    const total = this.price.amountMinor - discount;
    const inv: InvoiceDTO = {
      id: this.id("in"), subscriptionId: subId, customerId: sub.customerId, status, billingReason: reason, currency: "USD",
      subtotalMinor: this.price.amountMinor, discountMinor: discount, taxMinor: 0, totalMinor: total, amountDueMinor: total,
      amountPaidMinor: status === "paid" ? total : 0, number: `FAKE-${this.n}`, hostedInvoiceUrl: `https://invoice.stripe.com/i/fake_${this.n}`,
      invoicePdfUrl: `https://pay.stripe.com/invoice/fake_${this.n}/pdf`, receiptUrl: status === "paid" ? `https://pay.stripe.com/receipts/fake_${this.n}` : null,
      periodStart: sub.currentPeriodStart, periodEnd: sub.currentPeriodEnd, createdAt: new Date(this.now), paidAt: status === "paid" ? new Date(this.now) : null,
      failedAt: null, attemptCount: status === "paid" ? 1 : 1, nextPaymentAttemptAt: status === "open" ? new Date(this.now.getTime() + 3 * 86400_000) : null,
      discountApplied: discount > 0, livemode: false,
    };
    this.invoices.set(inv.id, inv);
    sub.latestInvoiceId = inv.id;
    if (status === "paid") this.cyclesPaid.set(subId, (this.cyclesPaid.get(subId) ?? 0) + 1);
    return inv;
  }

  /** A renewal that Stripe collects successfully. Advances the period. */
  renew(subId: string): InvoiceDTO {
    const sub = this.subs.get(subId)!;
    sub.currentPeriodStart = sub.currentPeriodEnd; sub.currentPeriodEnd = new Date(sub.currentPeriodEnd!.getTime() + 30 * 86400_000);
    return this.issueInvoice(subId, "subscription_cycle", "paid");
  }
  /** A renewal whose payment FAILS: the invoice stays open and the subscription goes past_due. */
  failRenewal(subId: string): InvoiceDTO {
    const sub = this.subs.get(subId)!;
    sub.currentPeriodStart = sub.currentPeriodEnd; sub.currentPeriodEnd = new Date(sub.currentPeriodEnd!.getTime() + 30 * 86400_000);
    sub.status = "past_due";
    return this.issueInvoice(subId, "subscription_cycle", "open");
  }
  /** The customer fixes their card: the open invoice is paid and the subscription is active again. */
  recover(subId: string): InvoiceDTO {
    const sub = this.subs.get(subId)!;
    const inv = this.invoices.get(sub.latestInvoiceId!)!;
    inv.status = "paid"; inv.amountPaidMinor = inv.totalMinor; inv.paidAt = new Date(this.now); inv.receiptUrl = "https://pay.stripe.com/receipts/fake_recovered"; inv.nextPaymentAttemptAt = null;
    sub.status = "active";
    this.cyclesPaid.set(subId, (this.cyclesPaid.get(subId) ?? 0) + 1);
    return inv;
  }
  cancelNow(subId: string) { const s = this.subs.get(subId)!; s.status = "canceled" as StripeSubscriptionStatus; s.endedAt = new Date(this.now); s.canceledAt = new Date(this.now); }
}

export const validSig = "t=1,v1=valid";
export const eventBody = (o: { id: string; type: string; objectId?: string; created?: number; refund?: StripeEventDTO["refund"] }) => JSON.stringify(o);
