import { describe, expect, it } from "vitest";
import { accountDictionary, accountKeys, translateAccount } from "@/lib/i18n/account";
import { SUPPORTED_LOCALES } from "@/lib/i18n/locales";
import { adminEn } from "@/lib/i18n/dictionaries/admin.en";
import { makeAdminCtx } from "./ctx";
import {
  couponStatusLabel, discountProgressText, durationLabel, errorMessage, eventStatusLabel, invoiceStatusLabel, NEXT_ACTION_KEYS, nextActionLabel, redemptionStatusLabel,
  statusLabel, usageRuleLabel,
} from "./labels";
import { METRIC_CAPTION_KEYS, metricCaption } from "./metricCaptions";
import { NEXT_ACTIONS, SUBSCRIPTION_STATUSES } from "../../types";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("admin dictionary", () => {
  const keys = accountKeys("admin");

  it("has all seven locales with exactly the English keys", () => {
    expect(SUPPORTED_LOCALES).toHaveLength(7);
    expect(keys.length).toBeGreaterThan(300);
    for (const locale of SUPPORTED_LOCALES) {
      const dict = accountDictionary("admin", locale);
      expect(Object.keys(dict).sort(), locale).toEqual([...keys].sort());
    }
  });

  it("keeps the same {placeholders} in every locale, for every key", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const dict = accountDictionary("admin", locale);
      for (const key of keys) expect(placeholders(dict[key]), `${locale}.${key}`).toEqual(placeholders(adminEn[key as keyof typeof adminEn]));
    }
  });

  it("has no empty strings", () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const [key, value] of Object.entries(accountDictionary("admin", locale))) expect(value.trim().length, `${locale}.${key}`).toBeGreaterThan(0);
    }
  });

  it("never outputs a raw key or an unfilled placeholder when given its values", () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const key of keys) {
        const values = Object.fromEntries(placeholders(adminEn[key as keyof typeof adminEn]).map((p) => [p, "X"]));
        const out = translateAccount(locale, "admin", key as keyof typeof adminEn, values);
        expect(out, `${locale}.${key}`).not.toBe(key);
        expect(out, `${locale}.${key}`).not.toMatch(/\{\w+\}/);
      }
    }
  });

  it("covers every enum the console labels, in every locale", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const c = makeAdminCtx(locale);
      for (const a of NEXT_ACTIONS) expect(nextActionLabel(a, c)).toBe(c.t(NEXT_ACTION_KEYS[a]));
      for (const s of SUBSCRIPTION_STATUSES) expect(statusLabel(s, c), `${locale} ${s}`).not.toBe(s);
      for (const r of ["once_per_user", "once_per_space", "unlimited_during_validity"]) expect(usageRuleLabel(r, c)).not.toBe(r);
      for (const r of ["reserved", "redeemed", "completed", "canceled", "released", "expired"]) expect(redemptionStatusLabel(r, c)).not.toBe(r);
      for (const r of ["active", "scheduled", "expired", "disabled"]) expect(couponStatusLabel(r, c).length).toBeGreaterThan(0);
      for (const r of ["processed", "failed"]) expect(eventStatusLabel(r, c).length).toBeGreaterThan(0);
      for (const name of Object.keys(METRIC_CAPTION_KEYS) as (keyof typeof METRIC_CAPTION_KEYS)[]) expect(metricCaption(name, c)).not.toMatch(/^metric_/);
      expect(durationLabel("repeating", 3, c)).toContain("3");
      expect(discountProgressText({ cyclesCompleted: 1, cyclesTotal: 6, status: "redeemed" }, { currentCycle: 2, totalCycles: 6 }, c)).toMatch(/2/);
      expect(invoiceStatusLabel({ status: "paid", amount_refunded_minor: 500, currency: "USD" }, c)).toMatch(/5/);
      expect(errorMessage("price_drift:amount_mismatch", c)).toContain("amount_mismatch");
      expect(errorMessage("not_a_code", c)).toBe(c.t("errGeneric"));
    }
  });

  it("does not translate raw values it does not know", () => {
    const c = makeAdminCtx("he");
    expect(statusLabel("future_status", c)).toBe("future_status");
    expect(nextActionLabel("future", c)).toBe("future");
  });
});
