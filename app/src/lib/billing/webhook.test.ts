import { describe, expect, it } from "vitest";
import { handleStripeWebhook } from "./webhook";
import { eventBody } from "./testing/fakeGateway";
import { USER, checkoutAndPay, makeHarness } from "./testing/harness";

describe("webhook intake", () => {
  it("rejects a bad signature with 400 and touches nothing", async () => {
    const h = makeHarness();
    const paid = await checkoutAndPay(h);
    const r = await handleStripeWebhook(h.deps, eventBody({ id: "evt_x", type: "checkout.session.completed", objectId: paid.sessionId }), "t=1,v1=forged");
    expect(r.status).toBe(400);
    expect(h.store.events.size).toBe(0);
    expect(h.store.tenants.size).toBe(0);
  });

  it("rejects a missing signature", async () => {
    const h = makeHarness();
    const r = await handleStripeWebhook(h.deps, eventBody({ id: "evt_x", type: "invoice.paid", objectId: "in_1" }), null);
    expect(r.status).toBe(400);
  });

  it("checkout.session.completed provisions the Space", async () => {
    const h = makeHarness();
    const paid = await checkoutAndPay(h);
    const r = await h.deliver("checkout.session.completed", paid.sessionId);
    expect(r).toEqual({ status: 200, body: "processed" });
    expect(h.store.tenantsOf(USER)).toHaveLength(1);
  });

  it("DUPLICATE delivery of the same Stripe event is acknowledged and changes nothing (no 2nd Space, no 2nd email)", async () => {
    const h = makeHarness();
    const paid = await checkoutAndPay(h);
    await h.deliver("checkout.session.completed", paid.sessionId, "evt_dup");
    const emailsBefore = h.store.emails().length;
    const again = await h.deliver("checkout.session.completed", paid.sessionId, "evt_dup");
    expect(again).toEqual({ status: 200, body: "duplicate" });
    expect(h.store.tenantsOf(USER)).toHaveLength(1);
    expect(h.store.emails()).toHaveLength(emailsBefore);
  });

  it("a DIFFERENT event for the same payment (checkout + invoice.paid) still yields one Space and ONE confirmation email", async () => {
    const h = makeHarness();
    const paid = await checkoutAndPay(h);
    await h.deliver("invoice.paid", paid.invoiceId);          // arrives BEFORE the checkout event (a real race)
    expect(h.store.tenants.size).toBe(0);                      // unmapped invoice: nothing to attach it to yet
    expect(h.store.emails("payment_confirmation")).toHaveLength(0);
    await h.deliver("checkout.session.completed", paid.sessionId);
    await h.deliver("invoice.payment_succeeded", paid.invoiceId);
    expect(h.store.tenantsOf(USER)).toHaveLength(1);
    expect(h.store.emails("payment_confirmation")).toHaveLength(1);
    const inv = h.store.invoices.get(paid.invoiceId)!;
    expect(inv.tenantId).toBe(h.store.tenantsOf(USER)[0][0]);
  });

  it("a concurrent second delivery while the first is still processing gets 409 (Stripe will retry later)", async () => {
    const h = makeHarness();
    h.store.events.set("evt_busy", { status: "processing", attempts: 1 });
    const r = await h.deliver("invoice.paid", "in_x", "evt_busy");
    expect(r.status).toBe(409);
  });

  it("a handler failure returns 500 so Stripe retries, and the retry succeeds", async () => {
    const h = makeHarness();
    const paid = await checkoutAndPay(h);
    h.store.failNextProvision = true;
    const first = await h.deliver("checkout.session.completed", paid.sessionId, "evt_retry");
    expect(first.status).toBe(500);
    expect(h.store.tenants.size).toBe(0);
    expect(h.store.events.get("evt_retry")!.status).toBe("failed");
    const second = await h.deliver("checkout.session.completed", paid.sessionId, "evt_retry");
    expect(second.status).toBe(200);
    expect(h.store.tenantsOf(USER)).toHaveLength(1);
  });

  it("a session that does not match our records is acknowledged (not retried forever) and provisions nothing", async () => {
    const h = makeHarness();
    const paid = await checkoutAndPay(h);
    h.stripe.sessions.get(paid.sessionId)!.metadata.user_id = "33333333-3333-4333-8333-333333333333";
    const r = await h.deliver("checkout.session.completed", paid.sessionId);
    expect(r).toEqual({ status: 200, body: "rejected:metadata_mismatch" });
    expect(h.store.tenants.size).toBe(0);
    expect(h.store.events.values().next().value!.status).toBe("failed");
  });

  it("checkout.session.expired frees the buyer's coupon reservation and expires the pending checkout", async () => {
    const h = makeHarness();
    h.store.addCoupon({ code: "X10", terms: { discountType: "percent", percentOff: 10, amountOffMinor: null, currency: null, durationType: "once", durationCycles: null }, stripeCouponId: "c1", usageRule: "once_per_user" });
    h.stripe.coupons.set("c1", { id: "c1", valid: true, percentOff: 10, amountOffMinor: null, currency: null, duration: "once", durationInMonths: null });
    const { startCheckout } = await import("./checkout");
    await startCheckout(h.deps, { userId: USER, email: null, spaceType: "teach", couponCode: "X10", consent: { immediateService: true, withdrawalAcknowledged: true }, locale: "en" });
    const sessionId = [...h.stripe.sessions.keys()][0];
    h.stripe.sessions.get(sessionId)!.status = "expired";
    await h.deliver("checkout.session.expired", sessionId);
    expect([...h.store.pending.values()][0].status).toBe("expired");
    expect(h.store.redemptions[0].status).toBe("expired");
  });

  it("unknown event types are acknowledged and ignored", async () => {
    const h = makeHarness();
    expect(await h.deliver("customer.created", "cus_1")).toEqual({ status: 200, body: "ignored" });
  });

  it("a subscription event for a Space that is not provisioned yet is harmless (state is applied once it exists)", async () => {
    const h = makeHarness();
    const paid = await checkoutAndPay(h);
    const r = await h.deliver("customer.subscription.created", paid.subscriptionId);
    expect(r.status).toBe(200);
    expect(h.store.tenants.size).toBe(0);
  });
});
