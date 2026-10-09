import { describe, expect, it } from "vitest";
import { FUNNEL_ERROR_CODES, funnelErrorKey, isCouponError, quoteRows } from "./checkoutView";
import { translate } from "@/lib/i18n";
import { translateAccount, type AccountKey } from "@/lib/i18n/account";

const labels = { dueToday: "Due today", then: "Then", firstCycle: "First billing cycle", firstCycles: "First {count} billing cycles", everyCycle: "Every billing cycle" };

describe("funnelErrorKey", () => {
  it("maps every code to a key that exists in every locale's resolved copy", () => {
    for (const code of FUNNEL_ERROR_CODES) {
      for (const l of ["en", "de", "es", "fr", "he"] as const) expect(translateAccount(l, "billing", funnelErrorKey(code)).length).toBeGreaterThan(0);
    }
    expect(funnelErrorKey("consent")).toBe("consentRequired");
    expect(funnelErrorKey("whatever")).toBe("checkoutProblem");
  });
  it("separates coupon errors from submit errors", () => {
    expect(isCouponError("expired")).toBe(true);
    expect(isCouponError("consent")).toBe(false);
  });
});

describe("quoteRows", () => {
  it("plain price: due today + every cycle", () => {
    const r = quoteRows({ currency: "USD", baseMinor: 2500, todayMinor: 2500, discount: null }, labels);
    expect(r.map((x) => [x.id, x.minor])).toEqual([["today", 2500], ["every", 2500]]);
  });
  it("repeating discount: first N cycles then full price", () => {
    const r = quoteRows({ currency: "USD", baseMinor: 2500, todayMinor: 1250, discount: { discountedMinor: 1250, cycles: 3, thenMinor: 2500 } }, labels);
    expect(r.map((x) => x.label)).toEqual(["Due today", "First 3 billing cycles", "Then"]);
  });
  it("one-cycle and forever discounts", () => {
    expect(quoteRows({ currency: "USD", baseMinor: 2500, todayMinor: 0, discount: { discountedMinor: 0, cycles: 1, thenMinor: 2500 } }, labels)[1].label).toBe("First billing cycle");
    const f = quoteRows({ currency: "USD", baseMinor: 2500, todayMinor: 2000, discount: { discountedMinor: 2000, cycles: null, thenMinor: null } }, labels);
    expect(f).toHaveLength(2);
    expect(f[1].label).toBe("Every billing cycle");
  });
});
