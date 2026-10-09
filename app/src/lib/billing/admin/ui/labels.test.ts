import { describe, expect, it } from "vitest";
import { NEXT_ACTIONS } from "../../types";
import {
  couponDiscountLabel, couponStatus, couponSyncState, couponWindowLabel, discountLabel, discountProgressText, durationLabel, errorMessage, fieldErrors, formatUtc,
  invoiceStatusLabel, isLargeDiscount, isUuid, minorToMajorString, money, NEXT_ACTION_KEYS, nextActionLabel, safeHttpsUrl, spaceTypeLabel, statusLabel, toDateTimeLocalUtc, usageRuleLabel,
} from "./labels";
import { makeAdminCtx } from "./ctx";

const c = makeAdminCtx("en");
const now = new Date("2026-11-01T12:00:00Z");

describe("labels", () => {
  it("has a label for every next action", () => {
    for (const a of NEXT_ACTIONS) expect(c.t(NEXT_ACTION_KEYS[a]).length).toBeGreaterThan(3);
    expect(nextActionLabel("renewal", c)).toBe("Renews");
    expect(nextActionLabel("mystery", c)).toBe("mystery");
  });
  it("formats UTC timestamps", () => {
    expect(formatUtc("2026-11-01T12:00:00Z", c)).toBe("2026-11-01 12:00 UTC");
    expect(formatUtc(new Date("2026-11-01T23:59:59+02:00"), c)).toBe("2026-11-01 21:59 UTC");
    expect(formatUtc(null, c)).toBe("-");
    expect(formatUtc("garbage", c)).toBe("-");
  });
  it("formats money and discounts", () => {
    expect(money(2500, "usd")).toBe("$25.00");
    expect(money(null, "usd")).toBe("-");
    expect(discountLabel({ discountType: "percent", percentOff: "50.00", amountOffMinor: null, currency: null }, c)).toBe("50% off");
    expect(discountLabel({ discountType: "percent", percentOff: 12.5, amountOffMinor: null, currency: null }, c)).toBe("12.5% off");
    expect(couponDiscountLabel({ discount_type: "fixed_amount", amount_off_minor: 500, currency: "USD" }, c)).toBe("$5.00 off");
  });
  it("formats durations", () => {
    expect(durationLabel("once", null, c)).toBe("First billing cycle");
    expect(durationLabel("repeating", 3, c)).toBe("First 3 billing cycles");
    expect(durationLabel("forever", null, c)).toBe("Forever");
  });
  it("derives coupon status", () => {
    expect(couponStatus({ active: false }, now)).toBe("disabled");
    expect(couponStatus({ active: true, valid_until: "2026-10-01T00:00:00Z" }, now)).toBe("expired");
    expect(couponStatus({ active: true, valid_from: "2026-12-01T00:00:00Z" }, now)).toBe("scheduled");
    expect(couponStatus({ active: true, valid_from: "2026-10-01T00:00:00Z", valid_until: "2026-12-01T00:00:00Z" }, now)).toBe("active");
    expect(couponStatus({ active: true }, now)).toBe("active");
  });
  it("describes windows and sync state per mode", () => {
    expect(couponWindowLabel({}, c)).toBe("Always available");
    expect(couponWindowLabel({ valid_from: "2026-11-01T00:00:00Z" }, c)).toContain("no end");
    expect(couponSyncState({ stripe_test_coupon_id: "x" }, "test")).toBe("synced");
    expect(couponSyncState({ stripe_test_coupon_id: "x" }, "live")).toBe("needs_sync");
    expect(couponSyncState({}, null)).toBe("no_stripe");
  });
  it("describes discount progress", () => {
    expect(discountProgressText({ cyclesCompleted: 1, cyclesTotal: 6, status: "redeemed" }, { currentCycle: 2, totalCycles: 6 }, c)).toBe("cycle 2 of 6");
    expect(discountProgressText({ cyclesCompleted: 1, cyclesTotal: null, status: "redeemed" }, { currentCycle: 2, totalCycles: null }, c)).toBe("cycle 2 (forever)");
    expect(discountProgressText({ cyclesCompleted: 6, cyclesTotal: 6, status: "completed" }, null, c)).toBe("finished after 6 cycles");
    expect(discountProgressText(null, null, c)).toBe("-");
  });
  it("labels invoices, urls, uuids", () => {
    expect(invoiceStatusLabel({ status: "paid", amount_refunded_minor: 500, currency: "USD" }, c)).toBe("paid - refunded $5.00");
    expect(invoiceStatusLabel({ status: "open" }, c)).toBe("open");
    expect(safeHttpsUrl("https://invoice.stripe.com/i/x")).toContain("https://");
    expect(safeHttpsUrl("http://x.test")).toBeNull();
    expect(safeHttpsUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpsUrl(null)).toBeNull();
    expect(isUuid("4f7b1f6e-1b2c-4d3e-8f9a-0123456789ab")).toBe(true);
    expect(isUuid("nope")).toBe(false);
    expect(usageRuleLabel("once_per_user", c)).toContain("Once per user");
  });
  it("maps error codes to messages", () => {
    expect(errorMessage("code_taken", c)).toMatch(/already exists/);
    expect(errorMessage("price_drift:amount", c)).toMatch(/amount/);
    expect(errorMessage("totally_new", c)).toMatch(/Something went wrong/);
    for (const code of ["invalid", "save_failed", "sync_failed", "audit_failed", "financial_terms_locked", "cap_below_usage", "not_found", "reason_required", "has_paid_subscription", "stripe_not_configured", "plan_not_synced", "owner_only", "user_not_found", "cannot_revoke_self", "last_owner", "step_up_required"]) {
      expect(errorMessage(code, c)).not.toMatch(/Something went wrong/);
    }
  });
  it("detects large discounts", () => {
    expect(isLargeDiscount({ discountType: "percent", percentOff: 50, durationType: "once" }, 50)).toBe(true);
    expect(isLargeDiscount({ discountType: "percent", percentOff: 49, durationType: "once" }, 50)).toBe(false);
    expect(isLargeDiscount({ discountType: "fixed_amount", percentOff: null, durationType: "forever" }, 50)).toBe(true);
  });
  it("converts form values", () => {
    expect(toDateTimeLocalUtc("2026-11-01T12:00:00Z")).toBe("2026-11-01T12:00");
    expect(toDateTimeLocalUtc(null)).toBe("");
    expect(minorToMajorString(500)).toBe("5.00");
  });
  it("localizes labels, money and dates with the account locale", () => {
    const de = makeAdminCtx("de");
    const he = makeAdminCtx("he");
    expect(money(2500, "usd", "de")).toBe("25,00\u00a0$");
    expect(money(2500, "usd")).toBe("$25.00");
    expect(formatUtc("2026-11-01T12:00:00Z", de)).toMatch(/2026.*UTC$/);
    expect(formatUtc("2026-11-01T12:00:00Z", he)).toMatch(/UTC$/);
    expect(statusLabel("active", c)).toBe("Active");
    expect(statusLabel("mystery", c)).toBe("mystery");
    expect(spaceTypeLabel("teach", c)).toBe("Teach");
    expect(spaceTypeLabel("custom", c)).toBe("custom");
    expect(spaceTypeLabel(null, c)).toBe("-");
    expect(discountLabel({ discountType: "fixed_amount", percentOff: null, amountOffMinor: 500, currency: "USD" }, de)).toContain("5,00");
  });
  it("maps known server field messages and leaves unknown ones alone", () => {
    const r = { ok: false as const, error: "invalid", fields: { code: "letters, digits, - and _ only", other: "Too small" } };
    expect(fieldErrors(r, c)).toEqual({ code: "letters, digits, - and _ only", other: "Too small" });
    expect(fieldErrors(r)).toEqual(r.fields);
    expect(fieldErrors({ ok: true })).toEqual({});
  });
});
