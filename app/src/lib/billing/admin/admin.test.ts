import { describe, expect, it } from "vitest";
import { hasRecentMfa, isAal2, latestTotpTimestamp } from "./amr";
import { couponFormToRaw, draftOfRaw } from "./forms";
import { computeOverviewMetrics } from "./metrics";
import { LARGE_DISCOUNT_PERCENT, checkCouponUpdate, couponInputSchema, couponMatchesStripe, financialTermsChanged, requiresStepUp, type CouponComparable } from "./policy";
import { redactForAudit } from "./redact";

describe("MFA claims (amr / aal)", () => {
  const now = new Date("2026-11-01T12:00:00Z");
  const ts = (agoSec: number) => Math.floor(now.getTime() / 1000) - agoSec;
  it("recognises an AAL2 session only", () => {
    const totp = [{ method: "password", timestamp: ts(120) }, { method: "totp", timestamp: ts(60) }];
    expect(isAal2({ aal: "aal2", amr: totp })).toBe(true);
    expect(isAal2({ aal: "aal1", amr: totp })).toBe(false); // a TOTP entry alone never raises the level
    expect(isAal2({ aal: "aal1" })).toBe(false);
    expect(isAal2({})).toBe(false);
    expect(isAal2(null)).toBe(false);
    expect(isAal2({ aal: "AAL2", amr: totp })).toBe(false);
  });
  it("edge cases: aal2 without a TOTP amr entry (other method, malformed, missing) is not Admin MFA", () => {
    expect(isAal2({ aal: "aal2" })).toBe(false);
    expect(isAal2({ aal: "aal2", amr: [] })).toBe(false);
    expect(isAal2({ aal: "aal2", amr: [{ method: "password", timestamp: ts(5) }] })).toBe(false);
    expect(isAal2({ aal: "aal2", amr: [{ method: "phone", timestamp: ts(5) }] })).toBe(false);
    expect(isAal2({ aal: "aal2", amr: [{ method: "totp", timestamp: "yesterday" }] })).toBe(false);
    expect(isAal2({ aal: "aal2", amr: "totp" })).toBe(false);
  });
  it("session refresh: a refreshed token keeps the ORIGINAL TOTP time, so step-up ages from the real verification", () => {
    // After a refresh Supabase re-issues the JWT with the same amr entries: the TOTP timestamp does not move.
    const refreshed = { aal: "aal2", amr: [{ method: "totp", timestamp: ts(3600) }], iat: Math.floor(now.getTime() / 1000) - 5 };
    expect(isAal2(refreshed)).toBe(true); // still an AAL2 session for reading pages
    expect(hasRecentMfa(refreshed, now, 600)).toBe(false); // but not "recent" for a dangerous action
  });
  it("step-up boundaries: clock skew up to 60 s in the future is tolerated, more is not", () => {
    expect(hasRecentMfa({ amr: [{ method: "totp", timestamp: ts(-60) }] }, now, 600)).toBe(true);
    expect(hasRecentMfa({ amr: [{ method: "totp", timestamp: ts(-61) }] }, now, 600)).toBe(false);
    expect(hasRecentMfa({ amr: [{ method: "totp", timestamp: Number.NaN }] }, now, 600)).toBe(false);
    expect(hasRecentMfa({ amr: [{ method: "totp", timestamp: Number.POSITIVE_INFINITY }] }, now, 600)).toBe(false);
  });
  it("finds the most recent TOTP verification and ignores other methods", () => {
    expect(latestTotpTimestamp({ amr: [{ method: "password", timestamp: ts(5) }, { method: "totp", timestamp: ts(900) }, { method: "totp", timestamp: ts(60) }] })).toBe(ts(60));
    expect(latestTotpTimestamp({ amr: [{ method: "password", timestamp: ts(5) }] })).toBeNull();
    expect(latestTotpTimestamp({ amr: "totp" })).toBeNull();
    expect(latestTotpTimestamp({ amr: [{ method: "totp", timestamp: "now" }] })).toBeNull();
  });
  it("step-up: recent means within the window; stale or absent MFA fails closed", () => {
    expect(hasRecentMfa({ amr: [{ method: "totp", timestamp: ts(60) }] }, now, 600)).toBe(true);
    expect(hasRecentMfa({ amr: [{ method: "totp", timestamp: ts(600) }] }, now, 600)).toBe(true);
    expect(hasRecentMfa({ amr: [{ method: "totp", timestamp: ts(601) }] }, now, 600)).toBe(false);
    expect(hasRecentMfa({ amr: [] }, now, 600)).toBe(false);
    expect(hasRecentMfa(null, now, 600)).toBe(false);
    expect(hasRecentMfa({ amr: [{ method: "totp", timestamp: ts(-3600) }] }, now, 600)).toBe(false); // a timestamp from the future is not "recent"
  });
});

describe("audit redaction", () => {
  it("removes anything secret-shaped at any depth and keeps normal fields", () => {
    const out = redactForAudit({ code: "LAUNCH10", stripe_secret_key: "sk_live_x", nested: { totp_secret: "ABC", ok: 1, list: [{ password: "p", fine: true }] }, authorization: "Bearer x", card_number: "4242" }) as Record<string, unknown>;
    expect(JSON.stringify(out)).not.toMatch(/sk_live|ABC|Bearer|4242|"p"/);
    expect(out.code).toBe("LAUNCH10");
    expect((out.nested as { ok: number }).ok).toBe(1);
  });
  it("truncates very long strings and deep structures", () => {
    expect((redactForAudit({ note: "x".repeat(900) }) as { note: string }).note.length).toBeLessThan(510);
    let deep: unknown = "end"; for (let i = 0; i < 12; i++) deep = { a: deep };
    expect(JSON.stringify(redactForAudit(deep))).toContain("[truncated]");
  });
});

describe("step-up policy", () => {
  it("creating a very large discount (>= 50% or forever) needs a recent code; a modest one does not", () => {
    expect(LARGE_DISCOUNT_PERCENT).toBe(50);
    expect(requiresStepUp("coupon.create", { draft: { discountType: "percent", percentOff: 50, amountOffMinor: null, durationType: "once" } })).toBe(true);
    expect(requiresStepUp("coupon.create", { draft: { discountType: "percent", percentOff: 10, amountOffMinor: null, durationType: "forever" } })).toBe(true);
    expect(requiresStepUp("coupon.create", { draft: { discountType: "percent", percentOff: 10, amountOffMinor: null, durationType: "repeating" } })).toBe(false);
  });
  it("editing a coupon customers have used, exemptions, the launch flag, plan sync and Admin changes all need a recent code", () => {
    expect(requiresStepUp("coupon.update", { couponHasRedemptions: true })).toBe(true);
    expect(requiresStepUp("coupon.update", { couponHasRedemptions: false })).toBe(false);
    for (const a of ["subscription.exempt_set", "subscription.exempt_clear", "settings.paid_checkout", "plan.sync_stripe", "admin.grant", "admin.revoke"] as const) expect(requiresStepUp(a)).toBe(true);
    expect(requiresStepUp("coupon.disable")).toBe(false);
  });
});

describe("coupon definition validation", () => {
  const base = { code: "LAUNCH10", discountType: "percent", percentOff: 10, usageRule: "unlimited_during_validity", durationType: "repeating", durationCycles: 3 };
  it("accepts WELCOME50 and LAUNCH10 shaped definitions", () => {
    expect(couponInputSchema.safeParse({ code: "WELCOME50", discountType: "percent", percentOff: 50, usageRule: "once_per_user", durationType: "once" }).success).toBe(true);
    expect(couponInputSchema.safeParse(base).success).toBe(true);
  });
  it.each([
    ["no percent for a percent coupon", { ...base, percentOff: null }],
    ["percent over 100", { ...base, percentOff: 101 }],
    ["a fixed coupon without currency", { code: "FIVE", discountType: "fixed_amount", amountOffMinor: 500, usageRule: "once_per_user", durationType: "once" }],
    ["a percent coupon carrying a fixed amount", { ...base, amountOffMinor: 500 }],
    ["repeating without cycles", { ...base, durationCycles: null }],
    ["cycles on a once coupon", { ...base, durationType: "once", durationCycles: 3 }],
    ["only 1 cycle as 'repeating' (that is 'once')", { ...base, durationCycles: 1 }],
    ["window end before start", { ...base, validFrom: "2027-03-01T00:00:00Z", validUntil: "2027-01-01T00:00:00Z" }],
    ["a code with spaces", { ...base, code: "BAD CODE" }],
    ["an unknown usage rule", { ...base, usageRule: "whenever" }],
  ])("rejects %s", (_n, input) => expect(couponInputSchema.safeParse(input).success).toBe(false));

  it("parses a real admin FORM into the same validated shape (amount entered in major units)", () => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ code: "FIVEOFF", discountType: "fixed_amount", amountOff: "5.00", currency: "usd", usageRule: "once_per_space", durationType: "once", validFrom: "2027-01-01T00:00", validUntil: "", globalMaxRedemptions: "100" })) fd.set(k, v);
    fd.append("spaceTypes", "teach");
    const parsed = couponInputSchema.safeParse(couponFormToRaw(fd));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toMatchObject({ amountOffMinor: 500, currency: "USD", globalMaxRedemptions: 100, spaceTypes: ["teach"], validUntil: null });
    expect(draftOfRaw(couponFormToRaw(fd))).toMatchObject({ discountType: "fixed_amount", amountOffMinor: 500 });
  });
});

describe("editing a used coupon never rewrites history", () => {
  const before: CouponComparable = { discountType: "percent", percentOff: 10, amountOffMinor: null, currency: null, durationType: "repeating", durationCycles: 3, usageRule: "unlimited_during_validity" };
  it("LAUNCH10 -> 50% is refused once anyone has used it", () => {
    expect(checkCouponUpdate({ before, after: { ...before, percentOff: 50 }, used: true, usedCount: 4, newGlobalMax: null })).toEqual({ ok: false, reason: "financial_terms_locked" });
  });
  it("changing the duration, usage rule or type is equally locked", () => {
    for (const patch of [{ durationCycles: 6 }, { durationType: "forever", durationCycles: null }, { usageRule: "once_per_user" }, { discountType: "fixed_amount" }] as Partial<CouponComparable>[]) {
      expect(checkCouponUpdate({ before, after: { ...before, ...patch }, used: true, usedCount: 1, newGlobalMax: null })).toMatchObject({ ok: false });
    }
  });
  it("availability, description, applicability and active flag stay editable on a used coupon", () => {
    expect(financialTermsChanged(before, { ...before })).toBe(false);
    expect(checkCouponUpdate({ before, after: { ...before }, used: true, usedCount: 4, newGlobalMax: 10 })).toEqual({ ok: true, recreateStripeCoupon: false });
  });
  it("an UNUSED coupon may change financial terms, which forces a fresh Stripe coupon (Stripe's are immutable)", () => {
    expect(checkCouponUpdate({ before, after: { ...before, percentOff: 20 }, used: false, usedCount: 0, newGlobalMax: null })).toEqual({ ok: true, recreateStripeCoupon: true });
  });
  it("the redemption cap cannot be lowered below redemptions already made", () => {
    expect(checkCouponUpdate({ before, after: before, used: true, usedCount: 7, newGlobalMax: 5 })).toEqual({ ok: false, reason: "cap_below_usage" });
  });
});

describe("Stripe coupon must carry exactly the promised terms", () => {
  const terms = { discountType: "percent", percentOff: 10, amountOffMinor: null, currency: null, durationType: "repeating", durationCycles: 3 };
  const stripe = { valid: true, percentOff: 10, amountOffMinor: null, currency: null, duration: "repeating", durationInMonths: 3 };
  it("accepts an exact match", () => expect(couponMatchesStripe(terms, stripe)).toEqual({ ok: true }));
  it.each([
    ["missing", null, "stripe_coupon_missing"],
    ["invalid", { ...stripe, valid: false }, "stripe_coupon_invalid"],
    ["20% instead of 10%", { ...stripe, percentOff: 20 }, "percent_mismatch"],
    ["wrong duration", { ...stripe, duration: "forever" }, "duration_mismatch"],
    ["wrong months", { ...stripe, durationInMonths: 12 }, "cycles_mismatch"],
  ])("detects %s", (_n, s, reason) => expect(couponMatchesStripe(terms, s as never)).toEqual({ ok: false, reason }));
  it("checks fixed amount + currency too", () => {
    const fixed = { discountType: "fixed_amount", percentOff: null, amountOffMinor: 500, currency: "USD", durationType: "once", durationCycles: null };
    expect(couponMatchesStripe(fixed, { valid: true, percentOff: null, amountOffMinor: 500, currency: "USD", duration: "once", durationInMonths: null })).toEqual({ ok: true });
    expect(couponMatchesStripe(fixed, { valid: true, percentOff: null, amountOffMinor: 600, currency: "USD", duration: "once", durationInMonths: null })).toMatchObject({ ok: false });
    expect(couponMatchesStripe(fixed, { valid: true, percentOff: null, amountOffMinor: 500, currency: "EUR", duration: "once", durationInMonths: null })).toMatchObject({ ok: false });
  });
});

describe("admin overview metrics (documented definitions)", () => {
  const NOW = new Date("2026-11-20T00:00:00Z");
  type Row = Parameters<typeof computeOverviewMetrics>[0][number];
  const row = (o: Partial<Row> & { id: string }): Row => ({ status: "active", baseAmountMinor: 2500, currentEffectiveAmountMinor: 2500, currency: "USD", cancelAtPeriodEnd: false, paymentFailedAt: null, eligibleForDeletionAt: null, ...o });
  it("counts only paying subscriptions and excludes exempt Spaces from every money/count metric", () => {
    const m = computeOverviewMetrics([
      row({ id: "a" }), row({ id: "b", currentEffectiveAmountMinor: 2250 }), row({ id: "c", cancelAtPeriodEnd: true }),
      row({ id: "x", status: "exempt", baseAmountMinor: null, currentEffectiveAmountMinor: null }), row({ id: "y", status: "exempt", baseAmountMinor: null, currentEffectiveAmountMinor: null }),
    ], new Set(["b"]), NOW);
    expect(m.paidSubscriptions).toBe(3);
    expect(m.paidSpaces).toBe(3);
    expect(m.exempt).toBe(2);
    expect(m.mrr.listMinor).toEqual({ USD: 7500 });         // gross list value
    expect(m.mrr.currentMinor).toEqual({ USD: 7250 });      // after the in-force discount - labelled distinctly
    expect(m.discounted).toBe(1);
    expect(m.scheduledCancellations).toBe(1);
  });
  it("buckets failure episodes by phase and keeps past_due out of 'paid subscriptions'", () => {
    const failed = (hoursAgo: number) => new Date(NOW.getTime() - hoursAgo * 3600_000);
    const m = computeOverviewMetrics([
      row({ id: "p1", status: "past_due", paymentFailedAt: failed(3) }), row({ id: "p2", status: "past_due", paymentFailedAt: failed(30) }),
      row({ id: "p3", status: "unpaid", paymentFailedAt: failed(200) }), row({ id: "p4", status: "unpaid", paymentFailedAt: failed(300), eligibleForDeletionAt: failed(1) }),
    ], new Set(), NOW);
    expect(m).toMatchObject({ paidSubscriptions: 0, paidSpaces: 4, paymentFailures: 4, guestSuspended: 1, studioSuspended: 2, deletionEligible: 1 });
    expect(m.mrr.listMinor).toEqual({});
  });
  it("ended subscriptions are not Spaces held and are not failures", () => {
    const m = computeOverviewMetrics([row({ id: "e", status: "canceled", paymentFailedAt: new Date(NOW.getTime() - 400 * 3600_000) })], new Set(), NOW);
    expect(m).toMatchObject({ paidSpaces: 0, paymentFailures: 0, paidSubscriptions: 0 });
  });
});
