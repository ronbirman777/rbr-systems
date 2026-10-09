import { describe, expect, it } from "vitest";
import { deriveSpaceAccess } from "./access";
import { runBillingJobs } from "./lifecycleJob";
import { syncSubscription } from "./sync";
import { USER, OTHER, checkoutAndPay, makeHarness, type Harness } from "./testing/harness";
import type { DiscountTerms } from "./quote";

const pct = (percentOff: number, durationType: DiscountTerms["durationType"], durationCycles: number | null = null): DiscountTerms => ({
  discountType: "percent", percentOff, amountOffMinor: null, currency: null, durationType, durationCycles,
});

/** A bought, provisioned Space (via the real webhook path). */
async function bought(h: Harness, o: { coupon?: { code: string; terms: DiscountTerms; rule?: string } | null; userId?: string; spaceType?: "teach" | "retreat" } = {}) {
  if (o.coupon) {
    const stripeId = `c_${o.coupon.code}`;
    h.store.addCoupon({ code: o.coupon.code, terms: o.coupon.terms, stripeCouponId: stripeId, usageRule: o.coupon.rule ?? "unlimited_during_validity" });
    h.stripe.coupons.set(stripeId, { id: stripeId, valid: true, percentOff: o.coupon.terms.percentOff, amountOffMinor: null, currency: null, duration: o.coupon.terms.durationType, durationInMonths: o.coupon.terms.durationCycles });
  }
  const paid = await checkoutAndPay(h, { userId: o.userId, spaceType: o.spaceType, coupon: o.coupon?.code ?? null });
  await h.deliver("checkout.session.completed", paid.sessionId);
  const sub = [...h.store.subs.values()].find((s) => s.stripeSubscriptionId === paid.subscriptionId)!;
  return { ...paid, sub, tenantId: sub.tenantId };
}
const confirmations = (h: Harness) => h.store.emails("payment_confirmation");

describe("payment confirmation email (addendum)", () => {
  it("first payment: sent once, from the verified invoice, with Space/plan/amount/next billing/status and the official document link", async () => {
    const h = makeHarness();
    const b = await bought(h);
    expect(confirmations(h)).toHaveLength(1);
    const p = confirmations(h)[0].payload;
    expect(p).toMatchObject({
      variant: "first", spaceName: "My Teaching Space", spaceType: "teach", planName: "InnerDweS Space", amountPaidMinor: 2500, currency: "USD",
      subscriptionStatus: "active", cancelsAtPeriodEnd: false, billingUrl: `https://app.example.test/billing/${b.tenantId}`,
    });
    expect(p.hostedInvoiceUrl).toMatch(/^https:\/\/invoice\.stripe\.com\//);
    expect(p.invoicePdfUrl).toMatch(/^https:\/\/pay\.stripe\.com\//);
    expect(typeof p.nextBillingDate).toBe("string");
    expect(confirmations(h)[0].userId).toBe(USER);
    expect(confirmations(h)[0].tenantId).toBe(b.tenantId);
  });

  it("is NOT triggered by returning from Checkout - only by verified payment state", async () => {
    const h = makeHarness();
    const { startCheckout } = await import("./checkout");
    await startCheckout(h.deps, { userId: USER, email: null, spaceType: "teach", couponCode: null, consent: { immediateService: true, withdrawalAcknowledged: true }, locale: "en" });
    h.advance(20_000);
    const { getCheckoutUiState } = await import("./reconcile");
    await getCheckoutUiState(h.deps, USER, (await h.store.findOpenCheckout(USER, "teach"))!.id);
    expect(h.store.emails()).toHaveLength(0);
  });

  it("recurring renewal: one confirmation per renewal invoice, variant 'renewal', and the invoice is linked to the right Space", async () => {
    const h = makeHarness();
    const b = await bought(h);
    h.advance(30 * 86400_000);
    const inv = h.stripe.renew(b.subscriptionId);
    await h.deliver("invoice.paid", inv.id);
    expect(confirmations(h)).toHaveLength(2);
    const second = confirmations(h).find((e) => e.dedupeKey === `payment_confirmation:${inv.id}`)!;
    expect(second.payload).toMatchObject({ variant: "renewal", amountPaidMinor: 2500 });
    expect(h.store.invoices.get(inv.id)).toMatchObject({ tenantId: b.tenantId, subscriptionId: b.sub.id, userId: USER });
  });

  it("duplicate Stripe webhook for the same renewal NEVER sends a second email", async () => {
    const h = makeHarness();
    const b = await bought(h);
    const inv = h.stripe.renew(b.subscriptionId);
    await h.deliver("invoice.paid", inv.id, "evt_a");
    await h.deliver("invoice.paid", inv.id, "evt_a");          // exact redelivery
    await h.deliver("invoice.payment_succeeded", inv.id);      // sibling event for the same payment
    await h.deliver("invoice.updated", inv.id);                // later update event
    expect(confirmations(h).filter((e) => e.dedupeKey === `payment_confirmation:${inv.id}`)).toHaveLength(1);
    expect(confirmations(h)).toHaveLength(2);
  });

  it("discounted payments show the coupon, the amount saved and 'payment k of N'", async () => {
    const h = makeHarness();
    const b = await bought(h, { coupon: { code: "LAUNCH10", terms: pct(10, "repeating", 3) } });
    expect(confirmations(h)[0].payload).toMatchObject({ amountPaidMinor: 2250, discountMinor: 250, couponCode: "LAUNCH10", discountCycle: { completed: 1, total: 3, status: "redeemed" } });
    const r2 = h.stripe.renew(b.subscriptionId);
    await h.deliver("invoice.paid", r2.id);
    const p2 = confirmations(h).find((e) => e.dedupeKey === `payment_confirmation:${r2.id}`)!.payload;
    expect(p2).toMatchObject({ amountPaidMinor: 2250, couponCode: "LAUNCH10", discountCycle: { completed: 2, total: 3 } });
  });

  it("the discount completes after N cycles and the next renewal is full price (automatic transition)", async () => {
    const h = makeHarness();
    const b = await bought(h, { coupon: { code: "LAUNCH10", terms: pct(10, "repeating", 3) } });
    for (let i = 0; i < 2; i++) { const inv = h.stripe.renew(b.subscriptionId); await h.deliver("invoice.paid", inv.id); }
    expect(h.store.redemptions[0]).toMatchObject({ status: "completed", cyclesCompleted: 3 });
    const full = h.stripe.renew(b.subscriptionId);
    await h.deliver("invoice.paid", full.id);
    expect(full.totalMinor).toBe(2500);
    expect(confirmations(h).find((e) => e.dedupeKey === `payment_confirmation:${full.id}`)!.payload.amountPaidMinor).toBe(2500);
  });

  it("WELCOME50 (50% for the FIRST cycle only): $12.50 then $25", async () => {
    const h = makeHarness();
    const b = await bought(h, { coupon: { code: "WELCOME50", terms: pct(50, "once"), rule: "once_per_user" } });
    expect(confirmations(h)[0].payload.amountPaidMinor).toBe(1250);
    const next = h.stripe.renew(b.subscriptionId);
    expect(next.totalMinor).toBe(2500);
  });

  it("a coupon whose availability window has CLOSED still keeps discounting an already-redeemed subscription", async () => {
    const h = makeHarness();
    const b = await bought(h, { coupon: { code: "LAUNCH10", terms: pct(10, "repeating", 3) } });
    h.store.coupons[0].validUntil = new Date("2026-11-02T00:00:00Z");
    h.advance(40 * 86400_000);
    const inv = h.stripe.renew(b.subscriptionId);
    await h.deliver("invoice.paid", inv.id);
    expect(inv.discountMinor).toBe(250);
    expect(h.store.redemptions[0]).toMatchObject({ status: "redeemed", cyclesCompleted: 2 });
  });

  it("payment recovery after a failure: variant 'recovered', access restored, failure stamps cleared, one confirmation", async () => {
    const h = makeHarness();
    const b = await bought(h);
    h.advance(30 * 86400_000);
    const failed = h.stripe.failRenewal(b.subscriptionId);
    await h.deliver("invoice.payment_failed", failed.id);
    expect(h.store.subs.get(b.sub.id)!.paymentFailedAt).not.toBeNull();
    expect(confirmations(h)).toHaveLength(1);                         // a FAILED payment is not a confirmation
    expect(h.store.emails("payment_failed")).toHaveLength(1);
    h.advance(2 * 86400_000);
    h.stripe.recover(b.subscriptionId);
    await h.deliver("invoice.paid", failed.id);
    const after = h.store.subs.get(b.sub.id)!;
    expect(after).toMatchObject({ status: "active", paymentFailedAt: null, guestSuspendedAt: null });
    expect(after.recoveredAt).not.toBeNull();
    const rec = confirmations(h).find((e) => e.dedupeKey === `payment_confirmation:${failed.id}`)!;
    expect(rec.payload.variant).toBe("recovered");
    expect(deriveSpaceAccess(after, h.store.now)).toMatchObject({ studioWritable: true, guestAvailable: true, reason: "active" });
  });

  it("final payment before a scheduled cancellation is flagged and states the end date", async () => {
    const h = makeHarness();
    const b = await bought(h);
    h.stripe.setCancelAtPeriodEnd(b.subscriptionId, true);
    await h.deliver("customer.subscription.updated", b.subscriptionId);
    h.advance(30 * 86400_000);
    const inv = h.stripe.renew(b.subscriptionId);
    await h.deliver("invoice.paid", inv.id);
    expect(confirmations(h).find((e) => e.dedupeKey === `payment_confirmation:${inv.id}`)!.payload).toMatchObject({ variant: "final", cancelsAtPeriodEnd: true });
  });

  it("failed invoice: recorded as open with attempt count, queues ONE 'payment failed' notice even if Stripe retries and re-notifies", async () => {
    const h = makeHarness();
    const b = await bought(h);
    const failed = h.stripe.failRenewal(b.subscriptionId);
    await h.deliver("invoice.payment_failed", failed.id);
    failed.attemptCount = 2;
    await h.deliver("invoice.payment_failed", failed.id);
    expect(h.store.invoices.get(failed.id)).toMatchObject({ status: "open", tenantId: b.tenantId });
    expect(h.store.emails("payment_failed")).toHaveLength(1);
    expect(h.store.emails("payment_failed")[0].payload).toMatchObject({ hostedInvoiceUrl: expect.stringContaining("invoice.stripe.com") });
  });

  it("void invoice: recorded as void, never counted as a payment, no confirmation", async () => {
    const h = makeHarness();
    const b = await bought(h);
    const open = h.stripe.failRenewal(b.subscriptionId);
    open.status = "void"; open.nextPaymentAttemptAt = null;
    h.stripe.subs.get(b.subscriptionId)!.status = "active";
    await h.deliver("invoice.voided", open.id);
    expect(h.store.invoices.get(open.id)!.status).toBe("void");
    expect(confirmations(h).find((e) => e.dedupeKey === `payment_confirmation:${open.id}`)).toBeUndefined();
  });

  it("refund: the refunded amount is mirrored on the invoice (idempotently)", async () => {
    const h = makeHarness();
    const b = await bought(h);
    h.store.invoices.get(b.invoiceId)!.refunded = undefined;
    const refund = { chargeId: "ch_1", paymentIntentId: b.invoiceId, amountRefundedMinor: 2500 };
    const body = (id: string) => JSON.stringify({ id, type: "charge.refunded", objectId: "ch_1", refund });
    const { handleStripeWebhook } = await import("./webhook");
    await handleStripeWebhook(h.deps, body("evt_r1"), "t=1,v1=valid");
    await handleStripeWebhook(h.deps, body("evt_r2"), "t=1,v1=valid");
    expect(h.store.invoices.get(b.invoiceId)!.refunded).toBe(2500);
  });

  it("a payment for one account's Space is never attributed to another account", async () => {
    const h = makeHarness();
    const a = await bought(h, { userId: USER });
    const o = await bought(h, { userId: OTHER });
    expect(h.store.invoices.get(a.invoiceId)!.userId).toBe(USER);
    expect(h.store.invoices.get(o.invoiceId)!.userId).toBe(OTHER);
    expect(h.store.invoices.get(a.invoiceId)!.tenantId).not.toBe(h.store.invoices.get(o.invoiceId)!.tenantId);
    expect(confirmations(h).map((e) => e.userId).sort()).toEqual([USER, OTHER].sort());
  });
});

describe("subscription lifecycle", () => {
  it("cancel at period end: access continues until the period ends, one scheduling email, then ended", async () => {
    const h = makeHarness();
    const b = await bought(h);
    h.stripe.setCancelAtPeriodEnd(b.subscriptionId, true);
    await h.deliver("customer.subscription.updated", b.subscriptionId);
    await h.deliver("customer.subscription.updated", b.subscriptionId, "evt_again");
    const sub = h.store.subs.get(b.sub.id)!;
    expect(sub.cancelAtPeriodEnd).toBe(true);
    expect(h.store.emails("cancellation_scheduled")).toHaveLength(1);
    expect(deriveSpaceAccess(sub, h.store.now)).toMatchObject({ studioWritable: true, guestAvailable: true });
    expect(sub.nextAction).toBe("cancel_at_period_end");
    h.advance(31 * 86400_000);
    h.stripe.cancelNow(b.subscriptionId);
    await h.deliver("customer.subscription.deleted", b.subscriptionId);
    const ended = h.store.subs.get(b.sub.id)!;
    expect(ended.status).toBe("canceled");
    expect(deriveSpaceAccess(ended, h.store.now)).toMatchObject({ studioWritable: false, guestAvailable: false, reason: "subscription_ended" });
    expect(h.store.emails("subscription_ended")).toHaveLength(1);
    expect(h.store.tenants.has(b.tenantId)).toBe(true); // the Space and its content are NOT destroyed
  });

  it("resuming before the end clears the scheduled cancellation", async () => {
    const h = makeHarness();
    const b = await bought(h);
    h.stripe.setCancelAtPeriodEnd(b.subscriptionId, true);
    await syncSubscription(h.deps, b.subscriptionId);
    h.stripe.setCancelAtPeriodEnd(b.subscriptionId, false);
    await syncSubscription(h.deps, b.subscriptionId);
    expect(h.store.subs.get(b.sub.id)!.cancelAtPeriodEnd).toBe(false);
    expect(h.store.subs.get(b.sub.id)!.nextAction).toBe("renewal");
  });

  it("next action is persisted by the single calculator after every change", async () => {
    const h = makeHarness();
    const b = await bought(h, { coupon: { code: "LAUNCH10", terms: pct(10, "repeating", 3) } });
    const s = h.store.subs.get(b.sub.id)!;
    expect(s.nextAction).toBe("discount_cycle");
    expect(s.nextExpectedChargeMinor).toBe(2250);
    expect(s.nextActionAt?.toISOString()).toBe(s.currentPeriodEnd?.toISOString());
  });

  it("failure on Space A leaves Space B of the same account fully operational", async () => {
    const h = makeHarness();
    const a = await bought(h, { spaceType: "teach" });
    const b = await bought(h, { spaceType: "retreat" });
    h.advance(30 * 86400_000);
    const failed = h.stripe.failRenewal(a.subscriptionId);
    await h.deliver("invoice.payment_failed", failed.id);
    h.advance(8 * 86400_000);
    const sa = h.store.subs.get(a.sub.id)!, sb = h.store.subs.get(b.sub.id)!;
    expect(deriveSpaceAccess(sa, h.store.now)).toMatchObject({ studioWritable: false, guestAvailable: false });
    expect(deriveSpaceAccess(sb, h.store.now)).toMatchObject({ studioWritable: true, guestAvailable: true, reason: "active" });
  });
});

describe("scheduled failed-payment actions", () => {
  async function failedSpace() {
    const h = makeHarness();
    const b = await bought(h);
    h.advance(30 * 86400_000);
    const failed = h.stripe.failRenewal(b.subscriptionId);
    await h.deliver("invoice.payment_failed", failed.id, "evt_f");
    return { h, b, failed };
  }
  const sender = () => { const sent: string[] = []; return { sent, send: async (m: { subject: string }) => { sent.push(m.subject); return { id: "re_1" }; } }; };

  it("sends Guest-unavailable at +24h, Studio-suspended at +7d, final warning at +12d - each exactly once however often the job runs", async () => {
    const { h } = await failedSpace();
    const run = () => runBillingJobs(h.deps, null);
    h.advance(25 * 3600_000); await run(); await run();
    expect(h.store.emails("guest_unavailable")).toHaveLength(1);
    h.advance(6.5 * 86400_000); await run(); await run();
    expect(h.store.emails("studio_suspended")).toHaveLength(1);
    h.advance(5 * 86400_000); await run(); await run();
    expect(h.store.emails("final_warning")).toHaveLength(1);
    h.advance(3 * 86400_000); const r = await run();
    expect(r.lifecycleActions.map((a) => a.action)).toEqual(["deletion_eligible"]);
    expect(h.store.emails()).toHaveLength(1 + 1 + 1 + 1 + 1); // confirmation + failed + guest + studio + final (no email for eligibility itself)
  });

  it("never deletes anything at the 14-day mark: the tenant still exists", async () => {
    const { h, b } = await failedSpace();
    h.advance(15 * 86400_000);
    await runBillingJobs(h.deps, null);
    expect(h.store.subs.get(b.sub.id)!.eligibleForDeletionAt).not.toBeNull();
    expect(h.store.tenants.has(b.tenantId)).toBe(true);
  });

  it("a recovery at any phase cancels the pending actions: the job later does nothing stale", async () => {
    const { h, b, failed } = await failedSpace();
    h.advance(25 * 3600_000); await runBillingJobs(h.deps, null);
    h.stripe.recover(b.subscriptionId);
    await h.deliver("invoice.paid", failed.id);
    const before = h.store.emails().length;
    h.advance(10 * 86400_000);
    const r = await runBillingJobs(h.deps, null);
    expect(r.lifecycleActions).toEqual([]);
    expect(h.store.emails()).toHaveLength(before);
    expect(h.store.subs.get(b.sub.id)!.studioSuspendedAt).toBeNull();
  });

  it("a NEW failure episode after a recovery notifies again (episode-scoped dedupe)", async () => {
    const { h, b, failed } = await failedSpace();
    h.advance(25 * 3600_000); await runBillingJobs(h.deps, null);
    h.stripe.recover(b.subscriptionId); await h.deliver("invoice.paid", failed.id);
    h.advance(30 * 86400_000);
    const f2 = h.stripe.failRenewal(b.subscriptionId); await h.deliver("invoice.payment_failed", f2.id, "evt_f2");
    h.advance(25 * 3600_000); await runBillingJobs(h.deps, null);
    expect(h.store.emails("guest_unavailable")).toHaveLength(2);
  });

  it("flushes the outbox through the provider: each queued email is sent once, with no tracking-style wrappers", async () => {
    const { h } = await failedSpace();
    const s = sender();
    const r1 = await runBillingJobs(h.deps, s);
    expect(r1.emails.sent).toBe(2); // first-payment confirmation + payment-failed
    const r2 = await runBillingJobs(h.deps, s);
    expect(r2.emails.sent).toBe(0);
    expect(s.sent).toHaveLength(2);
  });

  it("with no email provider configured the outbox simply waits (nothing is dropped or marked sent)", async () => {
    const { h } = await failedSpace();
    const r = await runBillingJobs(h.deps, null);
    expect(r.emails.skipped).toBe(true);
    expect([...h.store.outbox.values()].every((e) => e.status === "pending")).toBe(true);
  });

  it("one failing step is reported but never stops the others", async () => {
    const { h } = await failedSpace();
    h.store.expireStale = async () => { throw new Error("boom"); };
    h.advance(25 * 3600_000);
    const r = await runBillingJobs(h.deps, null);
    expect(r.errors.some((e) => e.startsWith("expire"))).toBe(true);
    expect(r.lifecycleActions.length).toBeGreaterThan(0);
  });
});
