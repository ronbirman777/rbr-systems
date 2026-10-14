import type { AdminCtx, AdminKey } from "./labels";

/**
 * One-line definitions shown under each Overview metric. Mirrors the definitions in ../metrics.ts.
 * The English text lives in the `admin` dictionary (metric_* keys); this maps a metric to its key.
 */
export const METRIC_CAPTION_KEYS = {
  paidSubscriptions: "metric_paidSubscriptions",
  paidSpaces: "metric_paidSpaces",
  mrrList: "metric_mrrList",
  mrrCurrent: "metric_mrrCurrent",
  discounted: "metric_discounted",
  paymentFailures: "metric_paymentFailures",
  guestSuspended: "metric_guestSuspended",
  studioSuspended: "metric_studioSuspended",
  scheduledCancellations: "metric_scheduledCancellations",
  deletionEligible: "metric_deletionEligible",
  exempt: "metric_exempt",
  mrrUnknownCurrency: "metric_mrrUnknownCurrency",
  openCheckouts: "metric_openCheckouts",
  failedEvents: "metric_failedEvents",
  stuckCheckouts: "metric_stuckCheckouts",
  paidCheckoutFlag: "metric_paidCheckoutFlag",
} as const satisfies Record<string, AdminKey>;

export type MetricName = keyof typeof METRIC_CAPTION_KEYS;

export function metricCaption(name: MetricName, c: AdminCtx): string {
  return c.t(METRIC_CAPTION_KEYS[name]);
}
