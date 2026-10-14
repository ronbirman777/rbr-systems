import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_METRIC_ROWS } from "@/lib/billing/admin/metrics";
import { loadOverview } from "@/lib/billing/admin/queries";
import { errorState, fromBoundedRead, noSource, notMeasured, ok, type MetricState, type MoneyMetric } from "../contracts/metric";
import { getWatchdogStatus, type WatchdogSource, type WatchdogStatus } from "../watchdog/status";
import { countBillingSpaces, countPublishing, countSpaceTotals } from "./spaces";

/**
 * The owner Overview (contracts §3.1): 30-second health, every tile a MetricState. Billing figures REUSE the billing
 * Overview loader (loadOverview + overviewCountSpecs), so the two pages can never disagree.
 *
 * Snapshot-dependent tiles (net new paid this month) need ADM-M1 (`admin_metric_snapshots`), which is NOT applied:
 * they are `not_measured`, never 0. Sections that have no source yet are `no_source`.
 */
export type ConsoleOverview = {
  asOf: Date;
  watchdog: WatchdogStatus;
  alertsApp: MetricState;
  paidSpaces: MetricState;
  /** Per-currency MRR (current discounted, list), or the state explaining why there is none. An empty map after a successful read = no paid subscriptions. */
  mrr: { current: MoneyMetric; list: MoneyMetric } | MetricState;
  /** Paid subscriptions whose currency is missing: EXCLUDED from every currency total (never assumed USD), counted here. */
  mrrCurrencyMissing: MetricState;
  netNewPaidMonth: MetricState;
  paymentFailures: MetricState;
  spacesByType: { type: string; metric: MetricState }[];
  spacesTotal: MetricState;
  publishedThisMonth: MetricState;
  audioNearLimit: MetricState;
  costMtd: MetricState;
  billingAvailable: MetricState;
};

/** Reason codes (translated by the page as `rsn_<code>`). */
export const SNAPSHOTS_MISSING = "snapshots_missing";

function moneyFrom(by: Record<string, number>, truncated: boolean, asOf: Date): MoneyMetric {
  const out: MoneyMetric = {};
  for (const [cur, minor] of Object.entries(by)) out[cur] = fromBoundedRead(minor, truncated, MAX_METRIC_ROWS, { asOf, unit: { minor: cur }, source: "billing_synced:space_subscriptions" });
  return out;
}

export async function loadConsoleOverview(db: SupabaseClient, now: Date = new Date(), watchdogSource?: WatchdogSource): Promise<ConsoleOverview> {
  const [totals, publishing, watchdog] = await Promise.all([countSpaceTotals(db, now), countPublishing(db, now), getWatchdogStatus(now, watchdogSource)]);
  const billingCounts = await countBillingSpaces(db, now, totals.total);
  const billingAvailable = billingCounts.available;

  let paidSpaces: MetricState = billingAvailable;
  let paymentFailures: MetricState = billingAvailable;
  let mrr: ConsoleOverview["mrr"] = billingAvailable;
  let mrrCurrencyMissing: MetricState = billingAvailable;
  if (billingAvailable.state === "ok") {
    try {
      const o = await loadOverview(db, now);
      paidSpaces = ok(o.metrics.paidSubscriptions, { asOf: o.generatedAt, source: "billing_synced:space_subscriptions" });
      paymentFailures = ok(o.metrics.paymentFailures, { asOf: o.generatedAt, source: "billing_synced:space_subscriptions" });
      mrrCurrencyMissing = ok(o.metrics.mrrUnknownCurrency, { asOf: o.generatedAt, source: "billing_synced:space_subscriptions" });
      mrr = { current: moneyFrom(o.metrics.mrr.currentMinor, o.metricsTruncated, o.generatedAt), list: moneyFrom(o.metrics.mrr.listMinor, o.metricsTruncated, o.generatedAt) };
    } catch (e) {
      const err = errorState("billing_synced:space_subscriptions", e instanceof Error ? e.message.slice(0, 200) : undefined);
      paidSpaces = err; paymentFailures = err; mrr = err; mrrCurrencyMissing = err;
    }
  }

  return {
    asOf: now,
    watchdog,
    alertsApp: noSource("alerts_not_built"),
    paidSpaces,
    mrr,
    mrrCurrencyMissing,
    netNewPaidMonth: notMeasured(SNAPSHOTS_MISSING),
    paymentFailures,
    spacesByType: totals.byType,
    spacesTotal: totals.total,
    publishedThisMonth: publishing.publishedThisMonth,
    audioNearLimit: noSource("usage_not_connected"),
    costMtd: noSource("costs_not_connected"),
    billingAvailable,
  };
}
