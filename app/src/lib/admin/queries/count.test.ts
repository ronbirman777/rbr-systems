import { describe, expect, it } from "vitest";
import { countToMetric, exactCount } from "./count";

const NOW = new Date("2026-10-14T12:00:00Z");
const meta = { source: "supabase_sql:tenants", asOf: NOW };

describe("exact counts map onto the metric contract (missing is not zero)", () => {
  it("a numeric count is ok, including a genuine 0", () => {
    expect(countToMetric({ count: 7, error: null }, meta)).toMatchObject({ state: "ok", value: 7 });
    expect(countToMetric({ count: 0, error: null }, meta)).toMatchObject({ state: "ok", value: 0 });
  });
  it("a null count with no error (PostgREST HEAD on an unknown table answers 204) is an error, NOT 0", () => {
    expect(countToMetric({ count: null, error: null }, meta)).toMatchObject({ state: "error", source: "supabase_sql:tenants" });
  });
  it("a missing table/relation is no_source (e.g. Production before the billing migrations)", () => {
    expect(countToMetric({ count: null, error: { code: "PGRST205", message: "Could not find the table" } }, { ...meta, missingReason: "billing_missing" })).toEqual({ state: "no_source", reason: "billing_missing" });
    expect(countToMetric({ count: null, error: { code: "42P01", message: "relation does not exist" } }, meta)).toEqual({ state: "no_source", reason: "table_missing" });
    expect(countToMetric({ count: null, error: { code: "PGRST200", message: "no relationship" } }, meta).state).toBe("no_source");
  });
  it("any other error is an error state with the source", () => {
    expect(countToMetric({ count: 3, error: { code: "57014", message: "statement timeout" } }, meta)).toMatchObject({ state: "error", source: "supabase_sql:tenants" });
  });
  it("exactCount transfers no rows (limit 0) and turns a thrown query into an error", async () => {
    const seen: number[] = [];
    const q = { limit: (n: number) => { seen.push(n); return Promise.resolve({ count: 4, error: null }); } };
    await expect(exactCount(q, meta)).resolves.toMatchObject({ state: "ok", value: 4 });
    expect(seen).toEqual([0]);
    const boom = { limit: () => Promise.reject(new Error("network")) };
    await expect(exactCount(boom, meta)).resolves.toMatchObject({ state: "error" });
  });
});
