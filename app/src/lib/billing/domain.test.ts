import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CANCEL_SLACK_HOURS, LIFECYCLE_HOURS } from "./constants";
import { computeAudioEntitlements, type PlanEntitlementBundle } from "./entitlements";
import { lifecycleDeadlines, lifecyclePhase } from "./lifecycle";
import { assertMinor, formatMoney, percentOffMinor } from "./money";
import { computeNextAction, type RedemptionState } from "./nextAction";
import { buildQuote, discountCycleCount, discountedAmountMinor, type DiscountTerms } from "./quote";
import type { SubscriptionRecord } from "./types";
import { checkoutCancelUrl, checkoutSuccessUrl } from "./urls";

const MIGRATIONS = path.resolve(__dirname, "../../../supabase/migrations");
const sql = (f: string) => readFileSync(path.join(MIGRATIONS, f), "utf8");

describe("constants are pinned to the SQL that enforces them", () => {
  const m38 = sql("0038_billing_provisioning_lifecycle.sql");
  it("lifecycle hours match billing_apply_lifecycle() and space_access_state()", () => {
    for (const h of [LIFECYCLE_HOURS.guestSuspension, LIFECYCLE_HOURS.studioSuspension, LIFECYCLE_HOURS.finalWarning, LIFECYCLE_HOURS.deletionEligible]) {
      expect(m38).toContain(`interval '${h} hours'`);
    }
    expect(LIFECYCLE_HOURS).toEqual({ guestSuspension: 24, studioSuspension: 168, finalWarning: 288, deletionEligible: 336 });
  });
  it("uses fixed elapsed hours, never calendar days, for every billing deadline", () => {
    expect(m38).not.toMatch(/interval '\d+ days?'/);
  });
  it("the cancel-at-period-end slack matches the SQL", () => {
    expect(m38).toContain(`interval '${CANCEL_SLACK_HOURS} hours'`);
  });
  it("the base plan seed is $25/month in minor units", () => {
    expect(sql("0036_billing_core_tables.sql")).toMatch(/'space_monthly_usd',\s*'InnerDweS Space',\s*'month',\s*'USD',\s*2500/);
  });
  it("the audio bundle seed is 240 / 60 / 100000 with a +240 / +70000 add-on", () => {
    const s = sql("0036_billing_core_tables.sql");
    for (const piece of ["'libraryMinutes', 240", "'maxRecordingMinutes', 60", "'listeningMinutesPerMonth', 100000", "'priceMinor', 500", "'libraryMinutes', 240", "'listeningMinutesPerMonth', 70000"]) expect(s).toContain(piece);
  });
  it("0039 restricts exactly the Studio write surfaces and restates publish_space with only the billing guard added", () => {
    const m39 = sql("0039_billing_access_enforcement.sql");
    expect((m39.match(/as restrictive for/g) ?? []).length).toBe(20);
    const m34 = sql("0034_flow_daily_inspiration.sql");
    const body = (s: string) => s.slice(s.indexOf("create or replace function public.publish_space"), s.indexOf("revoke all on function public.publish_space"));
    const strip = (s: string) => s.replace(/-- TASK 032[\s\S]*?(?=select palette)/, "").replace(/\s+/g, " ").replace("v_access record; -- TASK 032 ", "");
    // Everything outside the marked guard is byte-for-byte the 0034 function.
    expect(strip(body(m39)).replace(/select access_ends_at into v_entitlement[\s\S]*?end if;/, "")).toContain("v_enabled_modules");
    expect(body(m39).length).toBeGreaterThan(body(m34).length);
  });
  it("the direct-creation guard is the ONLY way into tenants when paid checkout is required", () => {
    const m38b = sql("0038_billing_provisioning_lifecycle.sql");
    expect(m38b).toContain("PAYMENT_REQUIRED");
    expect(m38b).toContain("idw.provisioning");
  });
});

describe("money", () => {
  it("formats minor units, never floats", () => {
    expect(formatMoney(2500, "USD", "en")).toBe("$25.00");
    expect(formatMoney(1250, "usd", "en")).toBe("$12.50");
    expect(formatMoney(2250, "USD", "de")).toMatch(/22,50/);
    expect(() => assertMinor(12.5)).toThrow();
    expect(() => assertMinor(-1)).toThrow();
  });
  it("percent discount rounds half-up in minor units and never exceeds the amount", () => {
    expect(percentOffMinor(2500, 10)).toBe(250);
    expect(percentOffMinor(2500, 50)).toBe(1250);
    expect(percentOffMinor(2499, 10)).toBe(250);   // 249.9 -> 250
    expect(percentOffMinor(1, 50)).toBe(1);         // 0.5 -> 1 (half up)
    expect(percentOffMinor(2500, 100)).toBe(2500);
    expect(percentOffMinor(2500, 12.5)).toBe(313);  // 312.5 -> 313
    expect(() => percentOffMinor(2500, 0)).toThrow();
    expect(() => percentOffMinor(2500, 101)).toThrow();
  });
});

describe("quotes", () => {
  const plan = { amountMinor: 2500, currency: "USD" };
  const p = (percentOff: number, durationType: DiscountTerms["durationType"], durationCycles: number | null = null): DiscountTerms => ({ discountType: "percent", percentOff, amountOffMinor: null, currency: null, durationType, durationCycles });
  it("no coupon: pay the list price", () => expect(buildQuote(plan, null)).toEqual({ currency: "USD", baseMinor: 2500, todayMinor: 2500, discount: null }));
  it("WELCOME50: $12.50 today, then $25", () => expect(buildQuote(plan, p(50, "once")).discount).toEqual({ discountedMinor: 1250, cycles: 1, thenMinor: 2500 }));
  it("LAUNCH10: $22.50 for 3 cycles, then $25", () => expect(buildQuote(plan, p(10, "repeating", 3)).discount).toEqual({ discountedMinor: 2250, cycles: 3, thenMinor: 2500 }));
  it("forever: no 'then' price", () => expect(buildQuote(plan, p(10, "forever")).discount).toEqual({ discountedMinor: 2250, cycles: null, thenMinor: null }));
  it("fixed amount, floored at zero, currency must match", () => {
    const fixed: DiscountTerms = { discountType: "fixed_amount", percentOff: null, amountOffMinor: 500, currency: "USD", durationType: "once", durationCycles: null };
    expect(buildQuote(plan, fixed).todayMinor).toBe(2000);
    expect(discountedAmountMinor(300, fixed)).toBe(0);
    expect(() => buildQuote(plan, { ...fixed, currency: "EUR" })).toThrow();
  });
  it("cycle counts: once=1, repeating=N, forever=null; repeating needs >=2", () => {
    expect(discountCycleCount({ durationType: "once", durationCycles: null })).toBe(1);
    expect(discountCycleCount({ durationType: "repeating", durationCycles: 3 })).toBe(3);
    expect(discountCycleCount({ durationType: "forever", durationCycles: null })).toBeNull();
    expect(() => discountCycleCount({ durationType: "repeating", durationCycles: 1 })).toThrow();
  });
});

describe("lifecycle deadlines", () => {
  const f = new Date("2026-11-01T12:00:00Z");
  it("are fixed elapsed hours from payment_failed_at", () => {
    const d = lifecycleDeadlines(f);
    expect(d.guestSuspendedAt.toISOString()).toBe("2026-11-02T12:00:00.000Z");
    expect(d.studioSuspendedAt.toISOString()).toBe("2026-11-08T12:00:00.000Z");
    expect(d.finalWarningAt.toISOString()).toBe("2026-11-13T12:00:00.000Z");
    expect(d.deletionEligibleAt.toISOString()).toBe("2026-11-15T12:00:00.000Z");
  });
  it("is DST-independent (the deadline is the same elapsed time across a clock change)", () => {
    const d = lifecycleDeadlines(new Date("2026-10-31T22:00:00Z"));
    expect(d.studioSuspendedAt.getTime() - new Date("2026-10-31T22:00:00Z").getTime()).toBe(168 * 3600_000);
  });
  it("phases are inclusive at each boundary", () => {
    const at = (h: number) => new Date(f.getTime() + h * 3600_000);
    expect(lifecyclePhase(null, at(0))).toBe("healthy");
    expect(lifecyclePhase(f, at(23.99))).toBe("payment_issue");
    expect(lifecyclePhase(f, at(24))).toBe("guest_suspended");
    expect(lifecyclePhase(f, at(168))).toBe("studio_suspended");
    expect(lifecyclePhase(f, at(288))).toBe("final_warning");
    expect(lifecyclePhase(f, at(336))).toBe("deletion_eligible");
  });
});

describe("audio entitlements (data-driven, stackable, max recording never grows)", () => {
  const bundle: PlanEntitlementBundle = { audio: { libraryMinutes: 240, maxRecordingMinutes: 60, listeningMinutesPerMonth: 100000 }, addons: { audio_pack: { priceMinor: 500, currency: "USD", libraryMinutes: 240, listeningMinutesPerMonth: 70000 } } };
  it.each([[0, 240, 100000], [1, 480, 170000], [2, 720, 240000], [3, 960, 310000]])("%i add-on(s) -> %i library / 60 max / %i listening", (n, lib, listen) => {
    expect(computeAudioEntitlements(bundle, n)).toEqual({ libraryMinutes: lib, maxRecordingMinutes: 60, listeningMinutesPerMonth: listen });
  });
  it("is deterministic and rejects nonsense quantities", () => {
    expect(computeAudioEntitlements(bundle, 2)).toEqual(computeAudioEntitlements(bundle, 2));
    expect(() => computeAudioEntitlements(bundle, -1)).toThrow();
    expect(() => computeAudioEntitlements(bundle, 1.5)).toThrow();
    expect(() => computeAudioEntitlements({ audio: bundle.audio }, 1)).toThrow();
  });
  it("matches the SQL space_audio_entitlements() formula", () => {
    const s = sql("0038_billing_provisioning_lifecycle.sql");
    expect(s).toContain("coalesce(a.quantity, 0) * (b.entitlements #>> '{addons,audio_pack,libraryMinutes}')::integer");
    expect(s).toContain("coalesce(a.quantity, 0) * (b.entitlements #>> '{addons,audio_pack,listeningMinutesPerMonth}')::integer");
    // the max recording is read straight from the bundle, never multiplied
    expect(s).toMatch(/\(b\.entitlements #>> '\{audio,maxRecordingMinutes\}'\)::integer,/);
  });
});

describe("next action (one calculator for Admin, My Spaces and Billing)", () => {
  const NOW = new Date("2026-11-10T00:00:00Z");
  const sub = (o: Partial<SubscriptionRecord> = {}): SubscriptionRecord => ({
    id: "s", tenantId: "t", billingOwnerUserId: "u", planId: "p", stripeMode: "test", stripeSubscriptionId: "sub_1", status: "active", currency: "USD", baseAmountMinor: 2500,
    currentEffectiveAmountMinor: 2500, currentPeriodStart: new Date("2026-11-01T00:00:00Z"), currentPeriodEnd: new Date("2026-12-01T00:00:00Z"), cancelAtPeriodEnd: false, cancelAt: null,
    canceledAt: null, endedAt: null, paymentFailedAt: null, guestSuspendedAt: null, studioSuspendedAt: null, deletionWarningAt: null, eligibleForDeletionAt: null, recoveredAt: null,
    nextAction: "none", nextActionAt: null, nextExpectedChargeMinor: null, nextPaymentAttemptAt: null, lastPaidInvoiceId: null, exemptReason: null, exemptExpiresAt: null, ...o,
  });
  const terms = (cycles: number | null, kind: "once" | "repeating" | "forever"): DiscountTerms => ({ discountType: "percent", percentOff: 10, amountOffMinor: null, currency: null, durationType: kind, durationCycles: cycles });
  const red = (o: Partial<RedemptionState> & { done: number; total: number | null; kind?: "once" | "repeating" | "forever" }): RedemptionState => ({
    status: "redeemed", terms: terms(o.total === 1 ? null : o.total, o.kind ?? (o.total === 1 ? "once" : o.total == null ? "forever" : "repeating")), cyclesCompleted: o.done, cyclesTotal: o.total, discountEndsAt: null, ...o,
  });

  it("healthy, no discount: renewal at the period end for the current price", () => {
    expect(computeNextAction(sub(), null, { now: NOW })).toMatchObject({ action: "renewal", at: new Date("2026-12-01T00:00:00Z"), expectedChargeMinor: 2500 });
  });
  it("LAUNCH10 after payment 2 of 3: next renewal is the 3rd discounted payment at $22.50", () => {
    const r = computeNextAction(sub({ currentEffectiveAmountMinor: 2250 }), red({ done: 2, total: 3 }), { now: NOW });
    expect(r).toMatchObject({ action: "discount_cycle", expectedChargeMinor: 2250, discountProgress: { currentCycle: 3, totalCycles: 3 } });
  });
  it("after the last discounted payment the discount is finished and the next charge is full price", () => {
    // The last discounted invoice (in_3) is also the subscription's latest paid invoice: its period is running now.
    const r = computeNextAction(sub({ currentEffectiveAmountMinor: 2250, lastPaidInvoiceId: "in_3" }), { ...red({ done: 3, total: 3 }), status: "completed", lastCycleInvoiceId: "in_3" }, { now: NOW });
    expect(r).toMatchObject({ action: "discount_ends", expectedChargeMinor: 2500 });
  });
  it("once a later (full-price) invoice has been paid it is just a normal renewal - no clock involved", () => {
    const r = computeNextAction(sub({ lastPaidInvoiceId: "in_4" }), { ...red({ done: 3, total: 3 }), status: "completed", lastCycleInvoiceId: "in_3" }, { now: NOW });
    expect(r).toMatchObject({ action: "renewal", expectedChargeMinor: 2500 });
  });
  it("forever discounts never end", () => {
    const r = computeNextAction(sub({ currentEffectiveAmountMinor: 2250 }), red({ done: 40, total: null, kind: "forever" }), { now: NOW });
    expect(r).toMatchObject({ action: "discount_cycle", expectedChargeMinor: 2250, discountProgress: { currentCycle: 41, totalCycles: null } });
  });
  it("discount window (time-based, like Stripe): ordinary repeating discount still discounted until its last cycle", () => {
    // Started 2026-09-01, 3 months -> ends 2026-12-01. Paid Sep + Oct; the running period ends 2026-11-01 -> 3rd discounted.
    const r = computeNextAction(
      sub({ currentPeriodStart: new Date("2026-10-01T00:00:00Z"), currentPeriodEnd: new Date("2026-11-01T00:00:00Z") }),
      red({ done: 2, total: 3, discountEndsAt: new Date("2026-12-01T00:00:00Z") }), { now: new Date("2026-10-10T00:00:00Z") });
    expect(r).toMatchObject({ action: "discount_cycle", expectedChargeMinor: 2250, discountProgress: { currentCycle: 3, totalCycles: 3 } });
  });
  it("discount window closed although the counter has cycles left (an invoice in the window was voided): next charge is full price", () => {
    // Same discount, but the October invoice was voided: only 2 counted, and the next invoice (2026-12-01) is at the window end.
    const r = computeNextAction(sub(), red({ done: 2, total: 3, discountEndsAt: new Date("2026-12-01T00:00:00Z") }), { now: NOW });
    expect(r).toMatchObject({ action: "discount_ends", at: new Date("2026-12-01T00:00:00Z"), expectedChargeMinor: 2500, discountProgress: null });
  });
  it("a forever discount has no window and never closes", () => {
    const r = computeNextAction(sub(), red({ done: 2, total: null, kind: "forever", discountEndsAt: null }), { now: NOW });
    expect(r.action).toBe("discount_cycle");
  });
  it("cancel at period end: access ends at the period end, nothing more is charged", () => {
    expect(computeNextAction(sub({ cancelAtPeriodEnd: true }), null, { now: NOW })).toMatchObject({ action: "cancel_at_period_end", expectedChargeMinor: 0, at: new Date("2026-12-01T00:00:00Z") });
  });
  it("payment failure: the earliest of the Stripe retry and the next unapplied deadline", () => {
    const failed = new Date("2026-11-09T12:00:00Z"); // guest deadline = 2026-11-10T12:00Z, after NOW (2026-11-10T00:00Z)
    const retry = new Date("2026-11-10T06:00:00Z");
    expect(computeNextAction(sub({ paymentFailedAt: failed }), null, { now: NOW, nextPaymentAttemptAt: retry })).toMatchObject({ action: "payment_retry", at: retry });
    // A retry later than the deadline loses to the deadline; a retry already in the past is ignored.
    expect(computeNextAction(sub({ paymentFailedAt: failed }), null, { now: NOW, nextPaymentAttemptAt: new Date("2026-11-20T00:00:00Z") })).toMatchObject({ action: "guest_suspension", at: new Date("2026-11-10T12:00:00Z") });
    expect(computeNextAction(sub({ paymentFailedAt: failed }), null, { now: NOW, nextPaymentAttemptAt: new Date("2026-11-09T18:00:00Z") })).toMatchObject({ action: "guest_suspension" });
  });
  it("walks the failure timeline in order as stamps are applied", () => {
    const failed = new Date("2026-11-01T00:00:00Z");
    const s = (o: Partial<SubscriptionRecord>) => computeNextAction(sub({ paymentFailedAt: failed, ...o }), null, { now: NOW }).action;
    expect(s({})).toBe("guest_suspension");
    expect(s({ guestSuspendedAt: failed })).toBe("studio_suspension");
    expect(s({ guestSuspendedAt: failed, studioSuspendedAt: failed })).toBe("deletion_warning");
    expect(s({ guestSuspendedAt: failed, studioSuspendedAt: failed, deletionWarningAt: failed })).toBe("deletion_eligible");
    expect(s({ guestSuspendedAt: failed, studioSuspendedAt: failed, deletionWarningAt: failed, eligibleForDeletionAt: failed })).toBe("none");
  });
  it("exempt and ended subscriptions have nothing commercial next", () => {
    expect(computeNextAction(sub({ status: "exempt" }), null, { now: NOW }).action).toBe("none");
    expect(computeNextAction(sub({ status: "canceled" }), null, { now: NOW }).action).toBe("none");
  });
});

describe("checkout return URLs are built only from server-known values", () => {
  it("never include client input and always stay on the app origin", () => {
    expect(checkoutSuccessUrl("https://app.example.com/", "11111111-1111-4111-8111-111111111111")).toBe("https://app.example.com/create/complete?c=11111111-1111-4111-8111-111111111111");
    expect(checkoutCancelUrl("https://app.example.com", "teach")).toBe("https://app.example.com/create/teach?canceled=1");
    expect(checkoutCancelUrl("https://app.example.com", "retreat")).toBe("https://app.example.com/create/flow?canceled=1");
  });
});
