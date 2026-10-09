import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ row: null as unknown, throws: false, stripe: true }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (state.throws) throw new Error("db down");
            return { data: state.row };
          },
        }),
      }),
    }),
  }),
}));
vi.mock("./deps.server", () => ({ isStripeConfigured: () => state.stripe }));

import { decideCreateMode, getBasePlanPrice, getCreateMode } from "./funnelMode";

describe("decideCreateMode", () => {
  it("is legacy while the flag is off, regardless of Stripe", () => {
    expect(decideCreateMode(false, true)).toBe("legacy");
    expect(decideCreateMode(false, false)).toBe("legacy");
  });
  it("is paid only when enabled AND Stripe is configured", () => {
    expect(decideCreateMode(true, true)).toBe("paid");
    expect(decideCreateMode(true, false)).toBe("unavailable");
  });
});

describe("getCreateMode / getBasePlanPrice", () => {
  it("reads the singleton flag; any read failure keeps the legacy flow", async () => {
    Object.assign(state, { stripe: true, throws: false, row: { paid_checkout_enabled: true } });
    expect(await getCreateMode()).toBe("paid");
    Object.assign(state, { stripe: false });
    expect(await getCreateMode()).toBe("unavailable");
    Object.assign(state, { row: { paid_checkout_enabled: false } });
    expect(await getCreateMode()).toBe("legacy");
    Object.assign(state, { throws: true });
    expect(await getCreateMode()).toBe("legacy");
  });
  it("returns the trusted plan price or null", async () => {
    Object.assign(state, { throws: false, row: { unit_amount_minor: 2500, currency: "usd " } });
    expect(await getBasePlanPrice()).toEqual({ unitAmountMinor: 2500, currency: "usd" });
    Object.assign(state, { row: null });
    expect(await getBasePlanPrice()).toBeNull();
  });
});
