import { describe, expect, it } from "vitest";
import {
  UNKNOWN_CURRENCY, currencyBucket, errorState, fromBoundedRead, hasValue, healthOf, moneyByCurrency, noSource, notApplicable, notMeasured, ok, partialSum, settle,
  valueOf, withFreshness, type MetricState,
} from "./metric";

/** ADMIN-METRIC-CONTRACTS.md §4 "Required tests (Batch 1)": missing is never zero. */
const NOW = new Date("2026-10-14T12:00:00Z");
const meta = { asOf: NOW, source: "test" };

describe("missing is not zero", () => {
  it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY, "0", "", {}, []])("ok(%p) is an error, never { ok, 0 }", (v) => {
    const m = ok(v, meta);
    expect(m.state).toBe("error");
    expect(valueOf(m)).toBeNull();
  });
  it("a real 0 after a successful read is allowed", () => {
    expect(ok(0, meta)).toEqual({ state: "ok", value: 0, asOf: NOW.toISOString(), quality: "actual", unit: "count" });
  });
  it("a throwing read becomes error for that source, not 0", async () => {
    const m = await settle("supabase_sql:tenants", async () => { throw new Error("boom"); });
    expect(m).toMatchObject({ state: "error", source: "supabase_sql:tenants" });
    expect(valueOf(m)).toBeNull();
  });
  it("no_source / not_measured / not_applicable / error carry no value", () => {
    for (const m of [noSource("x"), notMeasured("x"), notApplicable("x"), errorState("x")]) {
      expect(hasValue(m)).toBe(false);
      expect(valueOf(m)).toBeNull();
      expect("value" in m).toBe(false);
    }
  });
});

describe("health verdicts: stale, error and no_source never render green", () => {
  const good = ok(5, meta);
  it.each<[string, MetricState]>([
    ["stale", withFreshness(ok(5, { asOf: new Date(NOW.getTime() - 3_600_000), source: "t" }), NOW, 60_000)],
    ["error", errorState("x")],
    ["no_source", noSource("x")],
    ["not_measured", notMeasured("x")],
    ["truncated", fromBoundedRead(5, true, 10, meta)],
  ])("%s + ok -> unknown", (_name, bad) => {
    expect(healthOf([good, bad])).toBe("unknown");
  });
  it("all fresh ok -> healthy; not_applicable is ignored; no inputs -> unknown", () => {
    expect(healthOf([good, good])).toBe("healthy");
    expect(healthOf([good, notApplicable("paid = 0")])).toBe("healthy");
    expect(healthOf([])).toBe("unknown");
    expect(healthOf([notApplicable("x")])).toBe("unknown");
  });
});

describe("freshness and bounded reads", () => {
  it("withFreshness marks a value older than max age stale and keeps the value greyed, with staleSince", () => {
    const m = withFreshness(ok(3, { asOf: "2026-10-14T10:00:00Z", source: "t" }), NOW, 3_600_000);
    expect(m).toMatchObject({ state: "stale", value: 3, staleSince: "2026-10-14T11:00:00.000Z" });
    expect(withFreshness(ok(3, { asOf: "2026-10-14T11:30:00Z", source: "t" }), NOW, 3_600_000).state).toBe("ok");
    expect(withFreshness(noSource("x"), NOW, 1).state).toBe("no_source");
  });
  it("a bounded read that hit its bound is truncated (a lower bound), otherwise ok", () => {
    expect(fromBoundedRead(50_000, true, 50_000, meta)).toMatchObject({ state: "truncated", value: 50_000, bound: 50_000 });
    expect(fromBoundedRead(10, false, 50_000, meta).state).toBe("ok");
  });
});

describe("money: per currency, never across currencies", () => {
  it("sums per ISO currency and never produces a cross-currency total", () => {
    const by = moneyByCurrency([
      { currency: "USD", amountMinor: 2500 }, { currency: "usd", amountMinor: 2500 }, { currency: "EUR", amountMinor: 2300 },
    ], meta);
    expect(Object.keys(by).sort()).toEqual(["EUR", "USD"]);
    expect(valueOf(by.USD)).toBe(5000);
    expect(valueOf(by.EUR)).toBe(2300);
    expect(Object.values(by).every((m) => hasValue(m) && typeof m.unit === "object")).toBe(true);
  });
  it("a null currency lands in the explicit unknown bucket (not USD)", () => {
    const by = moneyByCurrency([{ currency: null, amountMinor: 2500 }, { currency: " ", amountMinor: 100 }, { currency: "US", amountMinor: 1 }], meta);
    expect(Object.keys(by)).toEqual([UNKNOWN_CURRENCY]);
    expect(valueOf(by[UNKNOWN_CURRENCY])).toBe(2601);
    expect(by.USD).toBeUndefined();
    expect(currencyBucket(undefined)).toBe(UNKNOWN_CURRENCY);
  });
  it("a missing amount marks that currency error instead of silently undercounting", () => {
    const by = moneyByCurrency([{ currency: "USD", amountMinor: 2500 }, { currency: "USD", amountMinor: null }, { currency: "EUR", amountMinor: 1 }], meta);
    expect(by.USD.state).toBe("error");
    expect(by.EUR.state).toBe("ok");
  });
  it("partialSum labels a total partial and names what is missing", () => {
    const r = partialSum([{ label: "supabase", metric: ok(100, meta) }, { label: "vercel", metric: noSource("x") }, { label: "b2", metric: errorState("b2") }]);
    expect(r).toEqual({ total: 100, partial: true, missing: ["vercel", "b2"] });
    expect(partialSum([{ label: "a", metric: noSource("x") }])).toEqual({ total: null, partial: true, missing: ["a"] });
  });
});
