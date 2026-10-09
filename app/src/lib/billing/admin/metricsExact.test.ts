import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { computeOverviewMetrics, fetchAllPaged, overviewCountSpecs, type CountFilter, type CountedMetric } from "./metrics";
import { SUBSCRIPTION_STATUSES } from "../types";

/**
 * B5: the Overview's headline counts are exact database counts (no row cap), and the
 * row-based metrics (MRR, discounted) are read in bounded pages with a visible truncation flag.
 */

const NOW = new Date("2026-11-20T00:00:00Z");
const H = 3600_000;
type Row = Parameters<typeof computeOverviewMetrics>[0][number];

/** In-memory evaluation of a CountFilter list against a row, using the snake_case column names the specs target. */
function matches(r: Row, filters: CountFilter[]): boolean {
  const col: Record<string, unknown> = {
    status: r.status,
    payment_failed_at: r.paymentFailedAt ? r.paymentFailedAt.toISOString() : null,
    eligible_for_deletion_at: r.eligibleForDeletionAt ? r.eligibleForDeletionAt.toISOString() : null,
    cancel_at_period_end: r.cancelAtPeriodEnd,
  };
  return filters.every((f) => {
    if (!(f.col in col)) throw new Error(`spec uses unmapped column ${f.col}`);
    const v = col[f.col];
    switch (f.op) {
      case "eq": return v === f.value;
      case "neq": return v !== f.value; // PostgREST neq excludes NULL too; status is NOT NULL
      case "in": return f.values.includes(v as string);
      case "notIn": return v != null && !f.values.includes(v as string);
      case "notNull": return v != null;
      // ISO-8601 UTC strings of equal format compare lexicographically like timestamps.
      case "lte": return v != null && (v as string) <= f.value;
      case "gt": return v != null && (v as string) > f.value;
    }
  });
}

describe("overview exact count specs", () => {
  const ago = (h: number) => new Date(NOW.getTime() - h * H);
  const rows: Row[] = [];
  let i = 0;
  // Every status x a spread of failure ages (including the exact 24h / 168h boundaries) x flags.
  for (const status of SUBSCRIPTION_STATUSES) {
    for (const failedHoursAgo of [null, 1, 23.999, 24, 24.001, 100, 167.999, 168, 168.001, 300, 400]) {
      for (const cancelAtPeriodEnd of [false, true]) {
        for (const deletion of [false, true]) {
          rows.push({
            id: `r${i++}`, status, baseAmountMinor: 2500, currentEffectiveAmountMinor: 2000, currency: "USD", cancelAtPeriodEnd,
            paymentFailedAt: failedHoursAgo == null ? null : ago(failedHoursAgo), eligibleForDeletionAt: deletion ? ago(1) : null,
          });
        }
      }
    }
  }

  it("each spec reproduces computeOverviewMetrics exactly on the same rows", () => {
    const expected = computeOverviewMetrics(rows, new Set(), NOW);
    const specs = overviewCountSpecs(NOW);
    for (const [name, filters] of Object.entries(specs) as [CountedMetric, CountFilter[]][]) {
      expect(rows.filter((r) => matches(r, filters)).length, name).toBe(expected[name]);
    }
  });

  it("covers every count field of OverviewMetrics (only MRR and discounted stay row-based)", () => {
    const m = computeOverviewMetrics([], new Set(), NOW);
    const countFields = Object.keys(m).filter((k) => typeof (m as Record<string, unknown>)[k] === "number" && k !== "discounted").sort();
    expect(Object.keys(overviewCountSpecs(NOW)).sort()).toEqual(countFields);
  });
});

describe("fetchAllPaged (bounded, visible truncation)", () => {
  const table = (n: number) => Array.from({ length: n }, (_, k) => k);
  const source = (data: number[]) => {
    const calls: [number, number][] = [];
    const fetchPage = async (from: number, to: number) => { calls.push([from, to]); return { data: data.slice(from, to + 1), error: null }; };
    return { calls, fetchPage };
  };

  it("reads everything beyond a single page (no silent 5,000 / 1,000 cap)", async () => {
    const s = source(table(7_250));
    const r = await fetchAllPaged(s.fetchPage, { max: 50_000, pageSize: 1_000 });
    expect(r).toEqual({ rows: table(7_250), truncated: false });
    expect(s.calls.every(([f, t]) => t - f + 1 <= 1_000)).toBe(true);
  });

  it("a table of exactly the bound is complete, not truncated", async () => {
    const r = await fetchAllPaged(source(table(30)).fetchPage, { max: 30, pageSize: 10 });
    expect(r.rows).toHaveLength(30);
    expect(r.truncated).toBe(false);
  });

  it("stops at the hard bound and reports truncation when more rows exist", async () => {
    const r = await fetchAllPaged(source(table(31)).fetchPage, { max: 30, pageSize: 7 });
    expect(r.rows).toHaveLength(30);
    expect(r.truncated).toBe(true);
  });

  it("an error fails loudly instead of rendering a partial number", async () => {
    await expect(fetchAllPaged(async () => ({ data: null, error: { message: "boom" } }))).rejects.toThrow(/boom/);
  });
});

describe("loadOverview wiring (static)", () => {
  const src = readFileSync(path.join(__dirname, "queries.ts"), "utf8");
  const body = src.slice(src.indexOf("export async function loadOverview"), src.indexOf("export type SubscriptionListRow"));
  const page = readFileSync(path.join(__dirname, "../../../app/(site)/admin/billing/page.tsx"), "utf8");

  it("has no fixed row cap and uses exact head counts for headline numbers", () => {
    expect(body).not.toMatch(/\.limit\(/);
    expect(body).toContain('{ count: "exact", head: true }');
    expect(body).toContain("overviewCountSpecs(now)");
    expect(body).toContain("fetchAllPaged(");
  });

  it("the Overview page renders the truncation warning", () => {
    expect(page).toContain("o.metricsTruncated");
    expect(page).toContain('t("ovMetricsTruncated"');
  });
});
