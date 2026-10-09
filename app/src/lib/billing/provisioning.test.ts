import { describe, expect, it } from "vitest";
import { provisionFromVerifiedSession } from "./provisioning";
import { getCheckoutUiState, reconcileCheckout } from "./reconcile";
import { startCheckout } from "./checkout";
import { CONSENT, OTHER, USER, checkoutAndPay, makeHarness } from "./testing/harness";

describe("provisioning after verified payment", () => {
  it("one successful checkout creates exactly ONE Space with owner, subscription, seeded defaults", async () => {
    const h = makeHarness();
    const paid = await checkoutAndPay(h);
    const session = await h.stripe.retrieveCheckoutSession(paid.sessionId);
    const res = await provisionFromVerifiedSession(h.deps, session);
    expect(res.status).toBe("provisioned");
    expect(h.store.tenantsOf(USER)).toHaveLength(1);
    const sub = [...h.store.subs.values()][0];
    expect(sub).toMatchObject({ tenantId: res.tenantId, billingOwnerUserId: USER, status: "active", baseAmountMinor: 2500, currency: "USD" });
    expect(h.seeded).toEqual([{ tenantId: res.tenantId, type: "teach", name: "My Teaching Space" }]);
    expect(h.store.pending.get(paid.pendingId)).toMatchObject({ status: "provisioned", tenantId: res.tenantId });
  });

  it("a Flow purchase provisions a Flow ('retreat') Space", async () => {
    const h = makeHarness();
    const paid = await checkoutAndPay(h, { spaceType: "retreat" });
    const res = await provisionFromVerifiedSession(h.deps, await h.stripe.retrieveCheckoutSession(paid.sessionId));
    expect(h.store.tenants.get(res.tenantId)).toMatchObject({ productType: "retreat", name: "Untitled Retreat" });
  });

  it("is idempotent: provisioning the same payment again (retry / reconcile / duplicate event) returns the same Space", async () => {
    const h = makeHarness();
    const paid = await checkoutAndPay(h);
    const session = await h.stripe.retrieveCheckoutSession(paid.sessionId);
    const a = await provisionFromVerifiedSession(h.deps, session);
    const b = await provisionFromVerifiedSession(h.deps, session);
    const c = await provisionFromVerifiedSession(h.deps, session);
    expect([a.status, b.status, c.status]).toEqual(["provisioned", "already_provisioned", "already_provisioned"]);
    expect(new Set([a.tenantId, b.tenantId, c.tenantId]).size).toBe(1);
    expect(h.store.tenantsOf(USER)).toHaveLength(1);
    expect(h.store.subs.size).toBe(1);
  });

  it("an unpaid session is never provisioned", async () => {
    const h = makeHarness();
    await startCheckout(h.deps, { userId: USER, email: null, spaceType: "teach", couponCode: null, consent: CONSENT, locale: "en" });
    const open = await h.stripe.retrieveCheckoutSession([...h.stripe.sessions.keys()][0]);
    await expect(provisionFromVerifiedSession(h.deps, open)).rejects.toMatchObject({ code: "not_paid" });
    expect(h.store.tenants.size).toBe(0);
  });

  it("refuses a session whose metadata names a DIFFERENT user than the pending checkout (never provisions someone else's payment)", async () => {
    const h = makeHarness();
    const paid = await checkoutAndPay(h);
    const session = await h.stripe.retrieveCheckoutSession(paid.sessionId);
    await expect(provisionFromVerifiedSession(h.deps, { ...session, metadata: { ...session.metadata, user_id: OTHER } })).rejects.toMatchObject({ code: "metadata_mismatch" });
    expect(h.store.tenants.size).toBe(0);
  });

  it("refuses a session that points at a pending checkout that does not exist", async () => {
    const h = makeHarness();
    const paid = await checkoutAndPay(h);
    const session = await h.stripe.retrieveCheckoutSession(paid.sessionId);
    await expect(provisionFromVerifiedSession(h.deps, { ...session, clientReferenceId: "pc-nope", metadata: {} })).rejects.toMatchObject({ code: "checkout_not_found" });
  });

  it("refuses when the subscription is not active (e.g. payment still incomplete)", async () => {
    const h = makeHarness();
    const paid = await checkoutAndPay(h);
    h.stripe.subs.get(paid.subscriptionId)!.status = "incomplete";
    await expect(provisionFromVerifiedSession(h.deps, await h.stripe.retrieveCheckoutSession(paid.sessionId))).rejects.toMatchObject({ code: "subscription_not_active" });
    expect(h.store.tenants.size).toBe(0);
  });

  it("a database failure mid-provisioning leaves NO partial Space, marks the checkout failed (recoverable) and a retry succeeds once", async () => {
    const h = makeHarness();
    const paid = await checkoutAndPay(h);
    const session = await h.stripe.retrieveCheckoutSession(paid.sessionId);
    h.store.failNextProvision = true;
    await expect(provisionFromVerifiedSession(h.deps, session)).rejects.toThrow("simulated");
    expect(h.store.tenants.size).toBe(0);
    expect(h.store.pending.get(paid.pendingId)!.status).toBe("failed");
    const retry = await provisionFromVerifiedSession(h.deps, session);
    expect(retry.status).toBe("provisioned");
    expect(h.store.tenantsOf(USER)).toHaveLength(1);
  });

  it("the first paid invoice is mapped to the new Space and queues exactly one payment confirmation", async () => {
    const h = makeHarness();
    const paid = await checkoutAndPay(h);
    const res = await provisionFromVerifiedSession(h.deps, await h.stripe.retrieveCheckoutSession(paid.sessionId));
    const inv = h.store.invoices.get(paid.invoiceId)!;
    expect(inv).toMatchObject({ tenantId: res.tenantId, userId: USER, status: "paid" });
    expect(h.store.emails("payment_confirmation")).toHaveLength(1);
    expect(h.store.emails("payment_confirmation")[0].payload).toMatchObject({ variant: "first", amountPaidMinor: 2500, currency: "USD", spaceName: "My Teaching Space" });
  });
});

describe("the success redirect is never proof of payment", () => {
  it("opening the success URL without paying shows 'awaiting payment' and creates nothing", async () => {
    const h = makeHarness();
    await startCheckout(h.deps, { userId: USER, email: null, spaceType: "teach", couponCode: null, consent: CONSENT, locale: "en" });
    const pending = (await h.store.findOpenCheckout(USER, "teach"))!;
    h.advance(10_000);
    const ui = await getCheckoutUiState(h.deps, USER, pending.id);
    expect(ui).toEqual({ state: "awaiting_payment" });
    expect(h.store.tenants.size).toBe(0);
  });

  it("another account cannot read someone else's checkout state", async () => {
    const h = makeHarness();
    await startCheckout(h.deps, { userId: USER, email: null, spaceType: "teach", couponCode: null, consent: CONSENT, locale: "en" });
    const pending = (await h.store.findOpenCheckout(USER, "teach"))!;
    await expect(getCheckoutUiState(h.deps, OTHER, pending.id)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("DELAYED webhook: the buyer paid, no webhook yet - the status check reconciles with Stripe and provisions", async () => {
    const h = makeHarness();
    const paid = await checkoutAndPay(h);
    h.advance(10_000);
    const ui = await getCheckoutUiState(h.deps, USER, paid.pendingId);
    expect(ui).toMatchObject({ state: "ready", spaceType: "teach" });
    expect(h.store.tenantsOf(USER)).toHaveLength(1);
  });

  it("page refresh / two tabs polling the same checkout still yields ONE Space", async () => {
    const h = makeHarness();
    const paid = await checkoutAndPay(h);
    h.advance(10_000);
    const burst = await Promise.all([getCheckoutUiState(h.deps, USER, paid.pendingId), getCheckoutUiState(h.deps, USER, paid.pendingId), getCheckoutUiState(h.deps, USER, paid.pendingId)]);
    // The rate limit lets ONE poll query Stripe; the others honestly report the interim state for that tick.
    expect(burst.filter((s) => s.state === "ready").length).toBeGreaterThanOrEqual(1);
    expect(burst.every((s) => s.state === "ready" || s.state === "awaiting_payment")).toBe(true);
    // The very next poll converges, and no matter how many tabs asked there is exactly ONE Space.
    expect(await getCheckoutUiState(h.deps, USER, paid.pendingId)).toMatchObject({ state: "ready" });
    expect(h.store.tenantsOf(USER)).toHaveLength(1);
    expect(h.store.subs.size).toBe(1);
  });

  it("customer closes the browser after paying: the later webhook provisions, and a later reconcile finds it done", async () => {
    const h = makeHarness();
    const paid = await checkoutAndPay(h);
    expect((await h.deliver("checkout.session.completed", paid.sessionId)).status).toBe(200);
    expect(h.store.tenantsOf(USER)).toHaveLength(1);
    await reconcileCheckout(h.deps, paid.pendingId);
    expect(h.store.tenantsOf(USER)).toHaveLength(1);
  });

  it("while provisioning is slow the state is 'processing' (never a payment failure), delayed after ~25s", async () => {
    const h = makeHarness();
    const paid = await checkoutAndPay(h);
    h.store.pending.get(paid.pendingId)!.status = "provisioning";
    h.stripe.down = true; // reconcile cannot reach Stripe right now
    h.advance(10_000);
    expect(await getCheckoutUiState(h.deps, USER, paid.pendingId)).toEqual({ state: "processing", delayed: false });
    h.advance(30_000);
    expect(await getCheckoutUiState(h.deps, USER, paid.pendingId)).toEqual({ state: "processing", delayed: true });
  });
});
