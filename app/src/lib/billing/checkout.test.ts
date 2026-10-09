import { describe, expect, it } from "vitest";
import { cancelCheckoutByUser, previewCheckout, startCheckout } from "./checkout";
import { BillingError } from "./errors";
import { CONSENT, OTHER, USER, makeHarness } from "./testing/harness";

const terms = (o: Partial<{ percentOff: number; durationType: "once" | "repeating" | "forever"; durationCycles: number | null }> = {}) => ({
  discountType: "percent" as const, percentOff: o.percentOff ?? 10, amountOffMinor: null, currency: null, durationType: o.durationType ?? "once", durationCycles: o.durationCycles ?? null,
});
const start = (h: ReturnType<typeof makeHarness>, o: Partial<Parameters<typeof startCheckout>[1]> = {}) =>
  startCheckout(h.deps, { userId: USER, email: "a@example.com", spaceType: "teach", couponCode: null, consent: CONSENT, locale: "en", ...o });

describe("checkout creation - trust boundaries", () => {
  it("is refused while the server-side launch flag is off (paid checkout disabled)", async () => {
    const h = makeHarness(); h.store.flag = false;
    await expect(start(h)).rejects.toMatchObject({ code: "checkout_disabled" });
    expect(h.stripe.sessions.size).toBe(0);
    expect(h.store.pending.size).toBe(0);
  });

  it("requires BOTH consents (immediate service + withdrawal acknowledgement)", async () => {
    const h = makeHarness();
    await expect(start(h, { consent: { immediateService: true, withdrawalAcknowledged: false } })).rejects.toMatchObject({ code: "consent_required" });
    await expect(start(h, { consent: { immediateService: false, withdrawalAcknowledged: true } })).rejects.toMatchObject({ code: "consent_required" });
    expect(h.stripe.sessions.size).toBe(0);
  });

  it("only sells Teach and Flow: any other Space type is refused", async () => {
    const h = makeHarness();
    for (const t of ["client_hub", "admin", "", undefined, 42]) await expect(start(h, { spaceType: t })).rejects.toMatchObject({ code: "invalid_space_type" });
  });

  it("takes price, currency and Stripe price id from the TRUSTED plan only", async () => {
    const h = makeHarness();
    const r = await start(h);
    expect("url" in r).toBe(true);
    const session = [...h.stripe.sessions.values()][0];
    expect(session.priceId).toBe("price_fake_1"); // the plan's Stripe price, nothing client-supplied
    expect(session.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
  });

  it("refuses to sell when the Stripe Price drifts from the plan (amount, currency, interval, inactive)", async () => {
    for (const mutate of [
      (h: ReturnType<typeof makeHarness>) => { h.stripe.price.amountMinor = 2000; },
      (h: ReturnType<typeof makeHarness>) => { h.stripe.price.currency = "EUR"; },
      (h: ReturnType<typeof makeHarness>) => { h.stripe.price.interval = "year"; },
      (h: ReturnType<typeof makeHarness>) => { h.stripe.price.active = false; },
    ]) {
      const h = makeHarness(); mutate(h);
      await expect(start(h)).rejects.toMatchObject({ code: "price_drift" });
      expect(h.stripe.sessions.size).toBe(0);
    }
  });

  it("refuses when the plan has no Stripe price for this mode", async () => {
    const h = makeHarness(); h.store.plan.stripePriceId = null;
    await expect(start(h)).rejects.toMatchObject({ code: "plan_not_synced" });
  });

  it("creates NO tenant, membership or subscription - only a pending checkout", async () => {
    const h = makeHarness();
    await start(h);
    expect(h.store.tenants.size).toBe(0);
    expect(h.store.subs.size).toBe(0);
    expect([...h.store.pending.values()].map((p) => p.status)).toEqual(["checkout_created"]);
  });

  it("stores acceptance evidence (versions + consent text id) BEFORE sending the buyer to Stripe", async () => {
    const h = makeHarness();
    await start(h);
    const a = [...h.store.acceptances.values()][0];
    expect(a).toMatchObject({ userId: USER, locale: "en" });
    expect(a.termsVersion).toBeTruthy(); expect(a.privacyVersion).toBeTruthy(); expect(a.billingTermsVersion).toBeTruthy(); expect(a.consentTextId).toBeTruthy();
  });

  it("puts only the minimum reconciliation identifiers in Stripe metadata", async () => {
    const h = makeHarness();
    await start(h);
    const s = [...h.stripe.sessions.values()][0];
    expect(Object.keys(s.metadata).sort()).toEqual(["coupon", "pending_checkout_id", "plan_key", "space_type", "user_id"]);
    expect(JSON.stringify(s.metadata)).not.toMatch(/@|password|secret|card/i);
    expect(s.clientReferenceId).toBe(s.metadata.pending_checkout_id);
  });

  it("uses one Stripe customer per account across two purchases", async () => {
    const h = makeHarness();
    await start(h, { spaceType: "teach" });
    await start(h, { spaceType: "retreat" });
    expect(h.stripe.customers.size).toBe(1);
    const sessions = [...h.stripe.sessions.values()];
    expect(sessions[0].customerId).toBe(sessions[1].customerId);
  });

  it("a second tab reuses the SAME open checkout and Stripe session (no competing session)", async () => {
    const h = makeHarness();
    const a = await start(h); const b = await start(h);
    expect(h.store.pending.size).toBe(1);
    expect(h.stripe.sessions.size).toBe(1);
    expect(a).toEqual(b);
  });

  it("an Stripe outage while creating the session leaves no Space and releases any coupon", async () => {
    const h = makeHarness();
    h.store.addCoupon({ code: "WELCOME", terms: terms(), stripeCouponId: "coupon_x", usageRule: "once_per_user" });
    h.stripe.coupons.set("coupon_x", { id: "coupon_x", valid: true, percentOff: 10, amountOffMinor: null, currency: null, duration: "once", durationInMonths: null });
    h.stripe.down = true;
    await expect(start(h, { couponCode: "WELCOME" })).rejects.toThrow();
    h.stripe.down = false;
    expect(h.store.tenants.size).toBe(0);
    expect(h.store.redemptions.every((r) => r.status !== "reserved")).toBe(true);
  });
});

describe("coupons at checkout", () => {
  const setup = (couponTerms = terms(), extra: Partial<Parameters<ReturnType<typeof makeHarness>["store"]["addCoupon"]>[0]> = {}) => {
    const h = makeHarness();
    h.store.addCoupon({ code: "LAUNCH10", terms: couponTerms, stripeCouponId: "coupon_l10", ...extra });
    h.stripe.coupons.set("coupon_l10", { id: "coupon_l10", valid: true, percentOff: couponTerms.percentOff, amountOffMinor: null, currency: null, duration: couponTerms.durationType, durationInMonths: couponTerms.durationCycles });
    return h;
  };

  it("an invalid code is refused with a mapped reason and creates no session", async () => {
    const h = setup();
    const r = await start(h, { couponCode: "NOPE" });
    expect(r).toEqual({ error: "invalid" });
    expect(h.stripe.sessions.size).toBe(0);
  });

  it("a valid coupon attaches the matching Stripe coupon to the session and reserves it", async () => {
    const h = setup();
    const r = await start(h, { couponCode: " launch10 " }); // case + whitespace normalised
    expect("url" in r).toBe(true);
    expect([...h.stripe.sessions.values()][0].couponId).toBe("coupon_l10");
    expect(h.store.redemptions).toHaveLength(1);
    expect(h.store.redemptions[0].status).toBe("reserved");
  });

  it("refuses a coupon whose Stripe counterpart disagrees with the promised terms (never 'Admin says 10%, Stripe charges 20%')", async () => {
    const h = setup();
    h.stripe.coupons.get("coupon_l10")!.percentOff = 20;
    const r = await start(h, { couponCode: "LAUNCH10" });
    expect(r).toEqual({ error: "unavailable" });
    expect(h.stripe.sessions.size).toBe(0);
    expect(h.store.redemptions.every((x) => x.status !== "reserved")).toBe(true);
  });

  it.each([
    ["inactive", { active: false }, "inactive"],
    ["not started", { validFrom: new Date("2027-01-01T00:00:00Z") }, "not_started"],
    ["expired", { validUntil: new Date("2026-01-01T00:00:00Z") }, "expired"],
    ["wrong Space type", { spaceTypes: ["retreat"] }, "not_applicable"],
    ["not synced to Stripe", { stripeCouponId: null }, "unavailable"],
  ])("refuses a coupon that is %s", async (_n, extra, reason) => {
    const h = setup(terms(), extra);
    expect(await start(h, { couponCode: "LAUNCH10" })).toEqual({ error: reason });
  });

  it("once-per-user: a second Space for the same user is refused after the first completed", async () => {
    const h = setup(terms(), { usageRule: "once_per_user" });
    const r1 = await start(h, { couponCode: "LAUNCH10", spaceType: "teach" });
    expect("url" in r1).toBe(true);
    const r2 = await start(h, { couponCode: "LAUNCH10", spaceType: "retreat" });
    expect(r2).toEqual({ error: "in_use_elsewhere" });
  });

  it("unlimited-during-validity: the same user can use it on two Spaces", async () => {
    const h = setup(terms(), { usageRule: "unlimited_during_validity" });
    expect("url" in (await start(h, { couponCode: "LAUNCH10", spaceType: "teach" }))).toBe(true);
    expect("url" in (await start(h, { couponCode: "LAUNCH10", spaceType: "retreat" }))).toBe(true);
  });

  it("global cap: the last slot goes to one buyer, the next buyer is told the limit was reached", async () => {
    const h = setup(terms(), { cap: 1 });
    expect("url" in (await start(h, { couponCode: "LAUNCH10", userId: USER }))).toBe(true);
    expect(await start(h, { couponCode: "LAUNCH10", userId: OTHER })).toEqual({ error: "limit_reached" });
  });

  it("an abandoned checkout releases its coupon so it can be used again", async () => {
    const h = setup(terms(), { usageRule: "once_per_user" });
    await start(h, { couponCode: "LAUNCH10" });
    await cancelCheckoutByUser(h.deps, USER, "teach");
    expect(h.store.redemptions[0].status).toBe("released");
    expect("url" in (await start(h, { couponCode: "LAUNCH10", spaceType: "retreat" }))).toBe(true);
  });

  it("an expired checkout frees the reservation via the scheduled sweep", async () => {
    const h = setup(terms(), { usageRule: "once_per_user" });
    await start(h, { couponCode: "LAUNCH10" });
    h.advance(3 * 3600_000);
    const r = await h.store.expireStale();
    expect(r.checkouts).toBe(1);
    expect(h.store.redemptions[0].status).toBe("expired");
  });
});

describe("coupon preview (Apply button)", () => {
  it("returns a SERVER-computed quote: $25 base, discounted first cycle, then full price", async () => {
    const h = makeHarness();
    h.store.addCoupon({ code: "WELCOME50", terms: terms({ percentOff: 50, durationType: "once" }), stripeCouponId: "c1" });
    const p = await previewCheckout(h.deps, { userId: USER, spaceType: "teach", couponCode: "welcome50", locale: "en" });
    expect(p.coupon).toMatchObject({ applied: true, code: "WELCOME50" });
    expect(p.quote).toEqual({ currency: "USD", baseMinor: 2500, todayMinor: 1250, discount: { discountedMinor: 1250, cycles: 1, thenMinor: 2500 } });
  });

  it("LAUNCH10 over 3 cycles: $22.50 for 3 cycles, then $25", async () => {
    const h = makeHarness();
    h.store.addCoupon({ code: "LAUNCH10", terms: terms({ percentOff: 10, durationType: "repeating", durationCycles: 3 }), stripeCouponId: "c2" });
    const p = await previewCheckout(h.deps, { userId: USER, spaceType: "teach", couponCode: "LAUNCH10", locale: "en" });
    expect(p.quote.discount).toEqual({ discountedMinor: 2250, cycles: 3, thenMinor: 2500 });
    expect(p.quote.todayMinor).toBe(2250);
  });

  it("an empty code removes the coupon and returns the plain $25 quote", async () => {
    const h = makeHarness();
    h.store.addCoupon({ code: "WELCOME50", terms: terms({ percentOff: 50 }), stripeCouponId: "c1" });
    await previewCheckout(h.deps, { userId: USER, spaceType: "teach", couponCode: "WELCOME50", locale: "en" });
    const p = await previewCheckout(h.deps, { userId: USER, spaceType: "teach", couponCode: "", locale: "en" });
    expect(p.quote).toEqual({ currency: "USD", baseMinor: 2500, todayMinor: 2500, discount: null });
    expect(h.store.redemptions[0].status).toBe("released");
  });

  it("a refused coupon still returns the plain quote and a reason (nothing is silently applied)", async () => {
    const h = makeHarness();
    const p = await previewCheckout(h.deps, { userId: USER, spaceType: "teach", couponCode: "NOPE", locale: "en" });
    expect(p.coupon).toEqual({ applied: false, error: "invalid" });
    expect(p.quote.todayMinor).toBe(2500);
  });

  it("is refused when paid checkout is off, and never reveals a quote for an unsellable type", async () => {
    const h = makeHarness(); h.store.flag = false;
    await expect(previewCheckout(h.deps, { userId: USER, spaceType: "teach", couponCode: null, locale: null })).rejects.toBeInstanceOf(BillingError);
    h.store.flag = true;
    await expect(previewCheckout(h.deps, { userId: USER, spaceType: "nope", couponCode: null, locale: null })).rejects.toMatchObject({ code: "invalid_space_type" });
  });
});
