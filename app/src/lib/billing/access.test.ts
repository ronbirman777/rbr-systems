import { describe, expect, it } from "vitest";
import vectors from "./vectors/accessVectors.json";
import { deriveSpaceAccess, type AccessInput } from "./access";
import { combineCommercialAvailability } from "./commercialAccess";
import type { SpaceEntitlementRow } from "@/lib/entitlements/types";
import type { SubscriptionRecord } from "./types";

const NOW = new Date(vectors.now);
const at = (h: number) => new Date(NOW.getTime() + h * 3600_000);

type VectorSub = { status: string; cancel_at_period_end?: boolean; payment_failed_hours_ago?: number; period_end_hours_from_now?: number; exempt_expires_in_hours?: number };
const inputOf = (s: VectorSub): AccessInput => ({
  status: s.status as AccessInput["status"],
  cancelAtPeriodEnd: !!s.cancel_at_period_end,
  currentPeriodEnd: s.period_end_hours_from_now == null ? null : at(s.period_end_hours_from_now),
  paymentFailedAt: s.payment_failed_hours_ago == null ? null : at(-s.payment_failed_hours_ago),
  exemptExpiresAt: s.exempt_expires_in_hours == null ? null : at(s.exempt_expires_in_hours),
});

describe("deriveSpaceAccess - shared vectors (the SQL space_access_state() must give the same answers)", () => {
  it.each(vectors.vectors.map((v) => [v.name, v] as const))("%s", (_name, v) => {
    const got = deriveSpaceAccess(v.sub ? inputOf(v.sub as VectorSub) : null, NOW);
    expect(got.decided).toBe(v.expect.decided);
    expect(got.studioWritable).toBe(v.expect.studio);
    if (v.expect.guest !== null) expect(got.guestAvailable).toBe(v.expect.guest);
    if (v.expect.publish !== null) expect(got.canPublish).toBe(v.expect.publish);
    expect(got.reason).toBe(v.expect.reason);
  });

  it("covers every reason the SQL function can return", () => {
    const reasons = new Set(vectors.vectors.map((v) => v.expect.reason));
    for (const r of ["no_subscription", "exempt", "exemption_expired", "active", "payment_issue", "guest_suspended", "studio_suspended", "subscription_ended", "subscription_not_active"]) expect(reasons.has(r)).toBe(true);
  });
});

describe("combineCommercialAvailability - billing governs billed Spaces, legacy governs the rest", () => {
  const entitlement = (endsInHours: number): SpaceEntitlementRow => ({
    tenant_id: "t", access_type: "complimentary", starts_at: at(-1000).toISOString(), access_ends_at: at(endsInHours).toISOString(),
    stripe_customer_id: null, stripe_subscription_id: null, cancel_at_period_end: false, created_at: "", updated_at: "",
  });
  const sub = (o: Partial<SubscriptionRecord>): SubscriptionRecord => ({
    id: "s", tenantId: "t", billingOwnerUserId: "u", planId: "p", stripeMode: "test", stripeSubscriptionId: "sub_1", status: "active", currency: "USD", baseAmountMinor: 2500,
    currentEffectiveAmountMinor: 2500, currentPeriodStart: at(-100), currentPeriodEnd: at(500), cancelAtPeriodEnd: false, cancelAt: null, canceledAt: null, endedAt: null,
    paymentFailedAt: null, guestSuspendedAt: null, studioSuspendedAt: null, deletionWarningAt: null, eligibleForDeletionAt: null, recoveredAt: null, nextAction: "none",
    nextActionAt: null, nextExpectedChargeMinor: null, nextPaymentAttemptAt: null, exemptReason: null, exemptExpiresAt: null, ...o,
  });

  it("a Space with NO billing row behaves exactly as before (legacy entitlement)", () => {
    const a = combineCommercialAvailability(entitlement(100), null, NOW);
    expect(a).toMatchObject({ effectiveStatus: "complimentary", canPublish: true, isPubliclyAvailable: true });
    expect(a.billing).toBeUndefined();
    const lapsed = combineCommercialAvailability(entitlement(-1000), null, NOW);
    expect(lapsed).toMatchObject({ effectiveStatus: "inactive", canPublish: false, isPubliclyAvailable: false });
    const none = combineCommercialAvailability(null, null, NOW);
    expect(none).toMatchObject({ effectiveStatus: "inactive", canManage: true, canPublish: false });
  });

  it("an exempt internal Space stays fully available even after its legacy complimentary access lapsed", () => {
    const a = combineCommercialAvailability(entitlement(-5000), sub({ status: "exempt", exemptReason: "demo", stripeSubscriptionId: null }), NOW);
    expect(a).toMatchObject({ canPublish: true, isPubliclyAvailable: true, canManage: true });
    expect(a.billing?.reason).toBe("exempt");
  });

  it("an exemption that has expired falls back to the legacy entitlement", () => {
    const a = combineCommercialAvailability(entitlement(-5000), sub({ status: "exempt", exemptReason: "demo", exemptExpiresAt: at(-1) }), NOW);
    expect(a).toMatchObject({ isPubliclyAvailable: false, canPublish: false });
    expect(a.billing).toBeUndefined();
  });

  it("a paid Space ignores any (absent) legacy entitlement: active -> available", () => {
    const a = combineCommercialAvailability(null, sub({}), NOW);
    expect(a).toMatchObject({ effectiveStatus: "active", accessType: "active", canPublish: true, isPubliclyAvailable: true, canManage: true });
  });

  it("payment failed 30h ago: Guest unavailable but the owner can still edit and publish", () => {
    const a = combineCommercialAvailability(null, sub({ paymentFailedAt: at(-30) }), NOW);
    expect(a).toMatchObject({ isPubliclyAvailable: false, canManage: true, canPublish: true });
    expect(a.billing?.reason).toBe("guest_suspended");
  });

  it("payment failed 8 days ago: Studio suspended, nothing writable", () => {
    const a = combineCommercialAvailability(null, sub({ paymentFailedAt: at(-200) }), NOW);
    expect(a).toMatchObject({ isPubliclyAvailable: false, canManage: false, canPublish: false });
    expect(a.billing).toEqual({ reason: "studio_suspended", studioWritable: false });
  });

  it("a legacy Space that never had billing cannot be locked by a paid state it does not have", () => {
    expect(combineCommercialAvailability(entitlement(100), null, NOW).canManage).toBe(true);
  });
});
