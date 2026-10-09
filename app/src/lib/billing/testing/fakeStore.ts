import { lifecycleDeadlines } from "../lifecycle";
import { discountCycleCount } from "../quote";
import type { RedemptionState } from "../nextAction";
import type {
  BillingStore, CheckoutStatus, CouponRefusal, EmailJob, InvoiceUpsertResult, PendingCheckout, PlanRecord, ProvisionResult,
  ReservationResult, SubscriptionStateInput, SubscriptionStateResult,
} from "../store";
import type { StripeMode, SubscriptionRecord } from "../types";

/**
 * In-memory BillingStore that reproduces the SEMANTICS of the SQL functions the
 * services rely on (idempotent provisioning, atomic event claim, invoice
 * newly-paid detection, outbox dedupe, failure-episode state, lifecycle stamps).
 * The real SQL is proven separately by scripts/billing-db-verify.mjs against
 * Staging; this fake exists so service-level logic - ordering, mapping, what is
 * emailed and when - can be tested exhaustively without a database.
 */
type Redemption = {
  id: string; couponId: string; userId: string; pendingId: string; status: "reserved" | "redeemed" | "completed" | "canceled" | "released" | "expired";
  terms: RedemptionState["terms"]; stripeCouponId: string; tenantId: string | null; subscriptionId: string | null; cyclesCompleted: number;
  cyclesTotal: number | null; lastInvoice: string | null; discountEndsAt: Date | null; usageRule: string; expiresAt: Date;
};
type FakeCoupon = { id: string; code: string; active: boolean; validFrom: Date | null; validUntil: Date | null; usageRule: string; terms: RedemptionState["terms"]; stripeCouponId: string | null; cap: number | null; spaceTypes: string[] | null };
type InvoiceRow = Record<string, unknown> & { stripe_invoice_id: string; status: string; tenantId: string | null; subscriptionId: string | null; userId: string | null };

export class FakeStore implements BillingStore {
  flag = true;
  now = new Date("2026-11-01T12:00:00.000Z");
  plan: PlanRecord = {
    id: "plan-1", planKey: "space_monthly_usd", displayName: "InnerDweS Space", active: true, interval: "month", currency: "USD", unitAmountMinor: 2500,
    spaceTypes: ["teach", "retreat"], stripeProductId: "prod_FAKE", stripePriceId: "price_fake_1",
    entitlements: { audio: { libraryMinutes: 240, maxRecordingMinutes: 60, listeningMinutesPerMonth: 100000 }, addons: { audio_pack: { priceMinor: 500, currency: "USD", libraryMinutes: 240, listeningMinutesPerMonth: 70000 } } },
  };
  customers = new Map<string, string>();
  pending = new Map<string, PendingCheckout>();
  coupons: FakeCoupon[] = [];
  redemptions: Redemption[] = [];
  subs = new Map<string, SubscriptionRecord>();
  tenants = new Map<string, { name: string; productType: string; ownerId: string }>();
  invoices = new Map<string, InvoiceRow>();
  events = new Map<string, { status: string; attempts: number }>();
  outbox = new Map<string, { id: string; template: string; userId: string | null; tenantId: string | null; locale: string; payload: Record<string, unknown>; status: string; attempts: number; dedupeKey: string }>();
  acceptances = new Map<string, Record<string, unknown>>();
  users = new Map<string, { email: string | null; locale: string | null }>();
  provisionCalls = 0;
  private seq = 0;
  private uid(p: string) { return `${p}-${++this.seq}`; }

  async paidCheckoutEnabled() { return this.flag; }
  async getPlan(key: string) { return key === this.plan.planKey ? this.plan : null; }
  async getPlanById(id: string) { return id === this.plan.id ? this.plan : null; }
  async getCustomerId(userId: string, mode: StripeMode) { return this.customers.get(`${userId}:${mode}`) ?? null; }
  async saveCustomer(userId: string, mode: StripeMode, id: string) { this.customers.set(`${userId}:${mode}`, id); }

  async findOpenCheckout(userId: string, spaceType: string) {
    return [...this.pending.values()].find((p) => p.userId === userId && p.spaceType === spaceType && ["created", "checkout_created", "awaiting_payment"].includes(p.status)) ?? null;
  }
  async createPendingCheckout(i: Parameters<BillingStore["createPendingCheckout"]>[0]) {
    const existing = await this.findOpenCheckout(i.userId, i.spaceType);
    if (existing) return existing;
    const p: PendingCheckout = {
      id: this.uid("pc"), userId: i.userId, spaceType: i.spaceType, planId: i.planId, status: "created", stripeMode: i.mode, sessionId: null, customerId: null,
      subscriptionId: null, quote: i.quote, locale: i.locale, tenantId: null, failureCode: null, createdAt: new Date(this.now), updatedAt: new Date(this.now), expiresAt: i.expiresAt,
    };
    this.pending.set(p.id, p);
    return p;
  }
  async getPendingCheckout(id: string) { return this.pending.get(id) ?? null; }
  async getPendingBySession(_m: StripeMode, sessionId: string) { return [...this.pending.values()].find((p) => p.sessionId === sessionId) ?? null; }
  async setCheckoutQuote(id: string, quote: Record<string, unknown>) { const p = this.pending.get(id); if (p) p.quote = quote; }
  async touchCheckout(id: string) { const p = this.pending.get(id); if (p) p.updatedAt = new Date(this.now); }
  async transitionCheckout(id: string, from: CheckoutStatus[], to: "checkout_created" | "awaiting_payment" | "canceled" | "expired", extra?: { sessionId?: string; customerId?: string }) {
    const p = this.pending.get(id);
    if (!p || !from.includes(p.status) || ["payment_confirmed", "provisioning", "provisioned"].includes(p.status)) return false;
    p.status = to; p.sessionId = extra?.sessionId ?? p.sessionId; p.customerId = extra?.customerId ?? p.customerId; p.updatedAt = new Date(this.now);
    if (to === "canceled" || to === "expired") await this.releaseCoupon(id, to);
    return true;
  }
  async listStuckCheckouts() { return [...this.pending.values()].filter((p) => ["payment_confirmed", "provisioning", "failed"].includes(p.status) && p.sessionId); }

  addCoupon(c: Partial<FakeCoupon> & { code: string; terms: RedemptionState["terms"] }) {
    const coupon: FakeCoupon = { id: this.uid("cp"), active: true, validFrom: null, validUntil: null, usageRule: "unlimited_during_validity", stripeCouponId: null, cap: null, spaceTypes: null, ...c };
    this.coupons.push(coupon);
    return coupon;
  }
  async reserveCoupon(a: Parameters<BillingStore["reserveCoupon"]>[0]): Promise<ReservationResult> {
    const refuse = (reason: CouponRefusal): ReservationResult => ({ ok: false, reason });
    const c = this.coupons.find((x) => x.code.toUpperCase() === a.code.trim().toUpperCase());
    if (!c) return refuse("invalid");
    const p = this.pending.get(a.pendingCheckoutId);
    if (!p || p.userId !== a.userId || !["created", "checkout_created", "awaiting_payment"].includes(p.status)) return refuse("checkout_closed");
    if (!c.active) return refuse("inactive");
    if (c.validFrom && this.now < c.validFrom) return refuse("not_started");
    if (c.validUntil && this.now > c.validUntil) return refuse("expired");
    if (c.spaceTypes && !c.spaceTypes.includes(a.spaceType)) return refuse("not_applicable");
    if (!c.stripeCouponId) return refuse("unavailable");
    for (const r of this.redemptions) if (r.status === "reserved" && r.expiresAt <= this.now) r.status = "expired";
    const live = (r: Redemption) => ["reserved", "redeemed", "completed", "canceled"].includes(r.status);
    const mine = this.redemptions.find((r) => r.pendingId === p.id && live(r));
    if (mine?.couponId === c.id) return { ok: true, reason: "already_reserved", redemptionId: mine.id, couponId: c.id, stripeCouponId: c.stripeCouponId, terms: c.terms, usageRule: c.usageRule, reservationExpiresAt: mine.expiresAt };
    if (mine?.status === "reserved") mine.status = "released";
    if (c.usageRule === "once_per_user") {
      const other = this.redemptions.find((r) => r.couponId === c.id && r.userId === a.userId && live(r) && r.pendingId !== p.id);
      if (other) return refuse(other.status === "reserved" ? "in_use_elsewhere" : "already_used");
    }
    if (c.cap != null && this.redemptions.filter((r) => r.couponId === c.id && live(r)).length >= c.cap) return refuse("limit_reached");
    const r: Redemption = {
      id: this.uid("rd"), couponId: c.id, userId: a.userId, pendingId: p.id, status: "reserved", terms: c.terms, stripeCouponId: c.stripeCouponId, tenantId: null,
      subscriptionId: null, cyclesCompleted: 0, cyclesTotal: null, lastInvoice: null, discountEndsAt: null, usageRule: c.usageRule, expiresAt: new Date(this.now.getTime() + 75 * 60_000),
    };
    this.redemptions.push(r);
    return { ok: true, reason: "reserved", redemptionId: r.id, couponId: c.id, stripeCouponId: c.stripeCouponId, terms: c.terms, usageRule: c.usageRule, reservationExpiresAt: r.expiresAt };
  }
  async releaseCoupon(pendingId: string, reason: string) {
    for (const r of this.redemptions) if (r.pendingId === pendingId && r.status === "reserved") r.status = reason === "expired" ? "expired" : "released";
  }
  async expireStale() {
    let reservations = 0; let checkouts = 0;
    for (const r of this.redemptions) if (r.status === "reserved" && r.expiresAt <= this.now) { r.status = "expired"; reservations++; }
    for (const p of this.pending.values()) if (["created", "checkout_created", "awaiting_payment"].includes(p.status) && p.expiresAt <= this.now) { p.status = "expired"; checkouts++; await this.releaseCoupon(p.id, "expired"); }
    return { checkouts, reservations };
  }

  async saveAcceptance(a: Parameters<BillingStore["saveAcceptance"]>[0]) { this.acceptances.set(a.pendingCheckoutId, { ...a }); }

  async confirmPayment(a: Parameters<BillingStore["confirmPayment"]>[0]) {
    const p = this.pending.get(a.pendingCheckoutId)!;
    if (p.status === "provisioned" || p.status === "provisioning") return p.status;
    p.status = "payment_confirmed"; p.sessionId = p.sessionId ?? a.sessionId; p.customerId = a.customerId ?? p.customerId; p.subscriptionId = a.subscriptionId ?? p.subscriptionId;
    return p.status;
  }
  failNextProvision = false;
  async provision(a: Parameters<BillingStore["provision"]>[0]): Promise<ProvisionResult> {
    this.provisionCalls++;
    const p = this.pending.get(a.pendingCheckoutId)!;
    if (p.status === "provisioned" && p.tenantId) {
      const sub = [...this.subs.values()].find((s) => s.tenantId === p.tenantId);
      return { status: "already_provisioned", tenantId: p.tenantId, subscriptionId: sub?.id ?? null, userId: p.userId, spaceType: p.spaceType, couponStatus: null };
    }
    if (!["active", "trialing"].includes(a.sub.status)) throw new Error("subscription is not active");
    if (this.failNextProvision) { this.failNextProvision = false; throw new Error("simulated database failure"); }
    const tenantId = this.uid("tenant");
    this.tenants.set(tenantId, { name: a.spaceName, productType: p.spaceType, ownerId: p.userId! });
    const subId = this.uid("sub");
    this.subs.set(subId, {
      id: subId, tenantId, billingOwnerUserId: p.userId, planId: p.planId, stripeMode: p.stripeMode, stripeSubscriptionId: a.sub.stripe_subscription_id, status: a.sub.status as SubscriptionRecord["status"],
      currency: a.sub.currency, baseAmountMinor: a.sub.base_amount_minor, currentEffectiveAmountMinor: a.sub.effective_amount_minor,
      currentPeriodStart: a.sub.period_start ? new Date(a.sub.period_start) : null, currentPeriodEnd: a.sub.period_end ? new Date(a.sub.period_end) : null,
      cancelAtPeriodEnd: a.sub.cancel_at_period_end, cancelAt: null, canceledAt: null, endedAt: null, paymentFailedAt: null, guestSuspendedAt: null, studioSuspendedAt: null,
      deletionWarningAt: null, eligibleForDeletionAt: null, recoveredAt: null, nextAction: "none", nextActionAt: null, nextExpectedChargeMinor: null, nextPaymentAttemptAt: null, lastPaidInvoiceId: a.sub.latest_invoice_id,
      exemptReason: null, exemptExpiresAt: null,
    });
    let couponStatus: string | null = null;
    const r = this.redemptions.find((x) => x.pendingId === p.id && ["reserved", "expired", "released"].includes(x.status));
    if (r) {
      r.status = "redeemed"; r.tenantId = tenantId; r.subscriptionId = subId; r.cyclesTotal = discountCycleCount(r.terms); couponStatus = "redeemed";
    }
    p.status = "provisioned"; p.tenantId = tenantId;
    return { status: "provisioned", tenantId, subscriptionId: subId, userId: p.userId, spaceType: p.spaceType, couponStatus };
  }
  async failCheckout(id: string, code: string) { const p = this.pending.get(id); if (p && p.status !== "provisioned") { p.status = "failed"; p.failureCode = code; } }

  async claimEvent(a: Parameters<BillingStore["claimEvent"]>[0]) {
    const e = this.events.get(a.eventId);
    if (!e) { this.events.set(a.eventId, { status: "processing", attempts: 1 }); return "claimed" as const; }
    if (e.status === "processed" || e.status === "ignored") return "duplicate" as const;
    if (e.status === "processing") return "in_progress" as const;
    e.status = "processing"; e.attempts++; return "claimed" as const;
  }
  async finishEvent(a: Parameters<BillingStore["finishEvent"]>[0]) { const e = this.events.get(a.eventId)!; e.status = a.status; }

  private subByStripe(id: string) { return [...this.subs.values()].find((s) => s.stripeSubscriptionId === id); }
  async applySubscriptionState(_m: StripeMode, stripeId: string, s: SubscriptionStateInput): Promise<SubscriptionStateResult> {
    const sub = this.subByStripe(stripeId);
    if (!sub) return { result: "unknown_subscription" };
    if (sub.status === "exempt") return { result: "ignored_exempt", tenantId: sub.tenantId };
    const failed = !!s.latest_invoice_failed;
    let failedAt = sub.paymentFailedAt; let failedStarted = false; let recovered = false;
    if (["past_due", "unpaid"].includes(s.status) || (failed && !["canceled", "incomplete_expired"].includes(s.status))) {
      if (!failedAt) { failedAt = s.failure_observed_at ? new Date(s.failure_observed_at) : new Date(this.now); failedStarted = true; }
    } else if (["active", "trialing"].includes(s.status) && !failed && failedAt) recovered = true;
    const ended = ["canceled", "incomplete_expired"].includes(s.status) && !sub.endedAt;
    const before = { status: sub.status, cancel: sub.cancelAtPeriodEnd };
    sub.status = s.status as SubscriptionRecord["status"];
    if (s.currency) sub.currency = s.currency;
    if (s.base_amount_minor != null) sub.baseAmountMinor = s.base_amount_minor;
    if ("effective_amount_minor" in s) sub.currentEffectiveAmountMinor = s.effective_amount_minor ?? null;
    if (s.period_start) sub.currentPeriodStart = new Date(s.period_start);
    if (s.period_end) sub.currentPeriodEnd = new Date(s.period_end);
    if (s.cancel_at_period_end != null) sub.cancelAtPeriodEnd = s.cancel_at_period_end;
    if (s.latest_invoice_paid && s.latest_invoice_id) sub.lastPaidInvoiceId = s.latest_invoice_id;
    if (s.cancel_at !== undefined) sub.cancelAt = s.cancel_at ? new Date(s.cancel_at) : null;
    if (ended) sub.endedAt = s.ended_at ? new Date(s.ended_at) : new Date(this.now);
    if (recovered) { sub.paymentFailedAt = null; sub.guestSuspendedAt = null; sub.studioSuspendedAt = null; sub.deletionWarningAt = null; sub.eligibleForDeletionAt = null; sub.recoveredAt = new Date(this.now); }
    else sub.paymentFailedAt = failedAt;
    return {
      result: "applied", subscriptionId: sub.id, tenantId: sub.tenantId, userId: sub.billingOwnerUserId, statusBefore: before.status, statusAfter: s.status,
      failedStarted, recovered, ended, cancelAtPeriodEndBefore: before.cancel, cancelAtPeriodEndAfter: sub.cancelAtPeriodEnd,
    };
  }
  async upsertInvoice(inv: Record<string, unknown>): Promise<InvoiceUpsertResult> {
    const id = String(inv.stripe_invoice_id);
    const sub = inv.stripe_subscription_id ? this.subByStripe(String(inv.stripe_subscription_id)) : undefined;
    const existing = this.invoices.get(id);
    const status = String(inv.status);
    let newlyPaid = false; let newlyFailed = false;
    if (existing) {
      const effective = existing.status === "paid" ? "paid" : existing.status === "void" ? "void" : status;
      newlyPaid = effective === "paid" && existing.status !== "paid";
      newlyFailed = !existing.failed_at && !!inv.failed_at && effective !== "paid";
      Object.assign(existing, inv, { status: effective, failed_at: existing.failed_at ?? inv.failed_at, tenantId: sub?.tenantId ?? existing.tenantId, subscriptionId: sub?.id ?? existing.subscriptionId, userId: sub?.billingOwnerUserId ?? existing.userId });
    } else {
      newlyPaid = status === "paid"; newlyFailed = !!inv.failed_at && status !== "paid";
      this.invoices.set(id, { ...inv, stripe_invoice_id: id, status, tenantId: sub?.tenantId ?? null, subscriptionId: sub?.id ?? null, userId: sub?.billingOwnerUserId ?? null });
    }
    const row = this.invoices.get(id)!;
    return { result: existing ? "updated" : "created", invoiceId: id, status: row.status, newlyPaid, newlyFailed, tenantId: row.tenantId, subscriptionId: row.subscriptionId, userId: row.userId };
  }
  async setInvoiceRefund(_m: StripeMode, id: string, refunded: number) { const r = this.invoices.get(id); if (!r || r.refunded === refunded) return false; r.refunded = refunded; return true; }
  async recordDiscountCycle(subscriptionId: string, invoiceId: string, discountApplied: boolean) {
    const r = this.redemptions.find((x) => x.subscriptionId === subscriptionId && x.status === "redeemed");
    if (!r) return { status: "no_active_discount" };
    if (r.lastInvoice === invoiceId) return { status: "already_counted", cyclesCompleted: r.cyclesCompleted };
    r.lastInvoice = invoiceId;
    if (!discountApplied) { r.status = "completed"; r.discountEndsAt = new Date(this.now); return { status: "completed_discount_not_applied", cyclesCompleted: r.cyclesCompleted }; }
    r.cyclesCompleted++;
    if (r.cyclesTotal != null && r.cyclesCompleted >= r.cyclesTotal) { r.status = "completed"; r.discountEndsAt = new Date(this.now); return { status: "completed", cyclesCompleted: r.cyclesCompleted }; }
    return { status: "counted", cyclesCompleted: r.cyclesCompleted };
  }

  async getSubscriptionByStripeId(_m: StripeMode, id: string) { return this.subByStripe(id) ?? null; }
  async getSubscriptionById(id: string) { return this.subs.get(id) ?? null; }
  async getRedemptionState(subscriptionId: string): Promise<RedemptionState | null> {
    const r = this.redemptions.filter((x) => x.subscriptionId === subscriptionId && ["redeemed", "completed", "canceled"].includes(x.status)).pop();
    if (!r) return null;
    const coupon = this.coupons.find((c) => c.id === r.couponId);
    return { status: r.status as RedemptionState["status"], terms: r.terms, cyclesCompleted: r.cyclesCompleted, cyclesTotal: r.cyclesTotal, discountEndsAt: r.discountEndsAt, couponCode: coupon?.code ?? null, lastCycleInvoiceId: r.lastInvoice };
  }
  async setNextAction(id: string, a: { action: string; at: Date | null; expectedChargeMinor: number | null }) {
    const s = this.subs.get(id); if (!s) return;
    s.nextAction = a.action as SubscriptionRecord["nextAction"]; s.nextActionAt = a.at; s.nextExpectedChargeMinor = a.expectedChargeMinor;
  }
  async setNextPaymentAttempt(id: string, at: Date | null) { const s = this.subs.get(id); if (s) s.nextPaymentAttemptAt = at; }
  async applyLifecycle(now: Date) {
    const out: { subscriptionId: string; tenantId: string; userId: string | null; action: string; at: Date }[] = [];
    for (const s of this.subs.values()) {
      if (!s.paymentFailedAt || s.status === "exempt") continue;
      const d = lifecycleDeadlines(s.paymentFailedAt);
      const steps: [keyof SubscriptionRecord, Date, string][] = [["guestSuspendedAt", d.guestSuspendedAt, "guest_suspended"], ["studioSuspendedAt", d.studioSuspendedAt, "studio_suspended"], ["deletionWarningAt", d.finalWarningAt, "deletion_warning"], ["eligibleForDeletionAt", d.deletionEligibleAt, "deletion_eligible"]];
      for (const [field, at, action] of steps) {
        if (!s[field] && now >= at) { (s as Record<string, unknown>)[field] = at; out.push({ subscriptionId: s.id, tenantId: s.tenantId, userId: s.billingOwnerUserId, action, at }); }
      }
    }
    return out;
  }
  async listActiveSubscriptionsDueForResync() { return []; }

  async enqueueEmail(a: Parameters<BillingStore["enqueueEmail"]>[0]) {
    if (this.outbox.has(a.dedupeKey)) return false;
    this.outbox.set(a.dedupeKey, { id: this.uid("em"), template: a.template, userId: a.userId, tenantId: a.tenantId, locale: a.locale, payload: a.payload, status: "pending", attempts: 0, dedupeKey: a.dedupeKey });
    return true;
  }
  async claimEmails(limit: number): Promise<EmailJob[]> {
    const due = [...this.outbox.values()].filter((e) => e.status === "pending" || e.status === "failed").slice(0, limit);
    for (const e of due) { e.status = "sending"; e.attempts++; }
    return due.map((e) => ({ id: e.id, template: e.template, userId: e.userId, tenantId: e.tenantId, locale: e.locale, payload: e.payload, attempts: e.attempts }));
  }
  async finishEmail(id: string, status: "sent" | "failed" | "skipped") { const e = [...this.outbox.values()].find((x) => x.id === id); if (e && e.status === "sending") e.status = status; }
  async getUserContact(userId: string) { return this.users.get(userId) ?? { email: `${userId}@example.com`, locale: "en" }; }
  async getTenantSummary(tenantId: string) { const t = this.tenants.get(tenantId); return t ? { name: t.name, productType: t.productType } : null; }

  // ---- test helpers
  emails(template?: string) { return [...this.outbox.values()].filter((e) => !template || e.template === template); }
  tenantsOf(userId: string) { return [...this.tenants.entries()].filter(([, t]) => t.ownerId === userId); }
}
