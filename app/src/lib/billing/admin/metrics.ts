import { LIFECYCLE_HOURS, hoursToMs } from "../constants";
import { lifecyclePhase } from "../lifecycle";
import type { SubscriptionRecord } from "../types";

/**
 * Admin Billing Overview metrics - each one DEFINED here, in code, so the number
 * on the screen always means exactly one documented thing (docs/billing/METRICS.md
 * restates these). Inputs are subscription rows only; nothing about pending
 * checkouts, coupon entries or coupon validations can ever reach a metric.
 *
 *  paidSubscriptions   status active|trialing, NOT exempt, not scheduled to have ended.
 *                      (past_due/unpaid are counted under paymentFailures, not here.)
 *  paidSpaces          distinct Spaces with a non-exempt, non-ended subscription
 *                      (includes past_due/unpaid: they still hold a Space and owe money).
 *  mrr.listMinor       GROSS recurring list value: sum of base_amount_minor over
 *                      paidSubscriptions - what the base plan is worth before any discount.
 *  mrr.currentMinor    CURRENT discounted recurring amount: sum of
 *                      (current_effective_amount_minor ?? base_amount_minor) over the same set.
 *                      The two are always labelled distinctly; the gap is the discount in force.
 *                      Subscriptions scheduled to cancel at period end are still counted
 *                      (they pay until then) and are also shown under scheduledCancellations.
 *  discounted          paid subscriptions with a redeemed (in-progress) coupon discount.
 *  paymentFailures     open failure episode (payment_failed_at set), subscription not ended.
 *  guestSuspended      failure episode between +24h and +168h.
 *  studioSuspended     failure episode at/after +168h (not ended).
 *  scheduledCancellations  cancel_at_period_end and still active.
 *  deletionEligible    eligible_for_deletion_at set.
 *  exempt              internal/legacy exempt Spaces - shown for transparency, NEVER summed into revenue or paid counts.
 */
export type MoneyByCurrency = Record<string, number>;

export type OverviewMetrics = {
  paidSubscriptions: number;
  paidSpaces: number;
  mrr: { listMinor: MoneyByCurrency; currentMinor: MoneyByCurrency };
  discounted: number;
  paymentFailures: number;
  guestSuspended: number;
  studioSuspended: number;
  scheduledCancellations: number;
  deletionEligible: number;
  exempt: number;
};

const ENDED = new Set(["canceled", "incomplete_expired"]);

type MetricRow = Pick<
  SubscriptionRecord,
  "id" | "status" | "baseAmountMinor" | "currentEffectiveAmountMinor" | "currency" | "cancelAtPeriodEnd" | "paymentFailedAt" | "eligibleForDeletionAt"
>;

export function computeOverviewMetrics(subs: MetricRow[], discountedSubscriptionIds: { has(id: string): boolean }, now: Date): OverviewMetrics {
  const m: OverviewMetrics = {
    paidSubscriptions: 0, paidSpaces: 0, mrr: { listMinor: {}, currentMinor: {} }, discounted: 0, paymentFailures: 0,
    guestSuspended: 0, studioSuspended: 0, scheduledCancellations: 0, deletionEligible: 0, exempt: 0,
  };
  for (const s of subs) {
    if (s.status === "exempt") { m.exempt++; continue; }
    const ended = ENDED.has(s.status);
    if (!ended) m.paidSpaces++;
    if (s.eligibleForDeletionAt) m.deletionEligible++;
    if (s.paymentFailedAt && !ended) {
      m.paymentFailures++;
      const phase = lifecyclePhase(s.paymentFailedAt, now);
      if (phase === "guest_suspended") m.guestSuspended++;
      // From +168h on, Studio is suspended; the later phases (final warning, deletion eligible) are still Studio-suspended.
      else if (phase === "studio_suspended" || phase === "final_warning" || phase === "deletion_eligible") m.studioSuspended++;
    }
    if (s.status === "active" || s.status === "trialing") {
      m.paidSubscriptions++;
      const cur = (s.currency ?? "USD").toUpperCase();
      const base = s.baseAmountMinor ?? 0;
      m.mrr.listMinor[cur] = (m.mrr.listMinor[cur] ?? 0) + base;
      m.mrr.currentMinor[cur] = (m.mrr.currentMinor[cur] ?? 0) + (s.currentEffectiveAmountMinor ?? base);
      if (s.cancelAtPeriodEnd) m.scheduledCancellations++;
      if (discountedSubscriptionIds.has(s.id)) m.discounted++;
    }
  }
  return m;
}

/* ------------------------------------------------------------------------------------------
 * Exact headline counts (no row cap).
 *
 * Every COUNT metric above is also expressible as a plain PostgREST filter on
 * space_subscriptions (one row per Space: tenant_id is UNIQUE), so the Overview asks the
 * database for an exact count (`select('id', { count: 'exact', head: true })`) instead of
 * counting fetched rows. That removes the row cap from every headline number.
 *
 * The specs are pure data so a test can evaluate them in memory and prove they agree with
 * computeOverviewMetrics on the same rows (admin.test.ts "count specs match").
 *
 * Only the MRR sums and `discounted` (which needs the redeemed-coupon join) still need rows;
 * those are fetched in pages with a hard upper bound (MAX_METRIC_ROWS) and the Overview
 * shows a visible "metrics truncated" warning if the bound is hit.
 * ---------------------------------------------------------------------------------------- */

export type CountFilter =
  | { op: "eq"; col: string; value: string | boolean }
  | { op: "neq"; col: string; value: string }
  | { op: "in"; col: string; values: readonly string[] }
  | { op: "notIn"; col: string; values: readonly string[] }
  | { op: "notNull"; col: string }
  | { op: "lte"; col: string; value: string }
  | { op: "gt"; col: string; value: string };

export type CountedMetric =
  | "paidSubscriptions" | "paidSpaces" | "paymentFailures" | "guestSuspended" | "studioSuspended"
  | "scheduledCancellations" | "deletionEligible" | "exempt";

const PAID = ["active", "trialing"] as const;
const NOT_COUNTED_AS_SPACE = ["exempt", "canceled", "incomplete_expired"] as const;

/** Filters that reproduce each count metric exactly. `now` fixes the lifecycle phase boundaries. */
export function overviewCountSpecs(now: Date): Record<CountedMetric, CountFilter[]> {
  // Phase boundaries are inclusive (>=) on elapsed time, as in lifecyclePhase():
  //   guest_suspended  <=> now >= failedAt + 24h  AND now < failedAt + 168h
  //                    <=> failedAt <= now - 24h  AND failedAt > now - 168h
  //   studio_suspended (and later phases) <=> failedAt <= now - 168h
  const guestEdge = new Date(now.getTime() - hoursToMs(LIFECYCLE_HOURS.guestSuspension)).toISOString();
  const studioEdge = new Date(now.getTime() - hoursToMs(LIFECYCLE_HOURS.studioSuspension)).toISOString();
  const failing: CountFilter[] = [{ op: "notNull", col: "payment_failed_at" }, { op: "notIn", col: "status", values: NOT_COUNTED_AS_SPACE }];
  return {
    paidSubscriptions: [{ op: "in", col: "status", values: PAID }],
    paidSpaces: [{ op: "notIn", col: "status", values: NOT_COUNTED_AS_SPACE }],
    paymentFailures: failing,
    guestSuspended: [...failing, { op: "lte", col: "payment_failed_at", value: guestEdge }, { op: "gt", col: "payment_failed_at", value: studioEdge }],
    studioSuspended: [...failing, { op: "lte", col: "payment_failed_at", value: studioEdge }],
    scheduledCancellations: [{ op: "in", col: "status", values: PAID }, { op: "eq", col: "cancel_at_period_end", value: true }],
    deletionEligible: [{ op: "notNull", col: "eligible_for_deletion_at" }, { op: "neq", col: "status", value: "exempt" }],
    exempt: [{ op: "eq", col: "status", value: "exempt" }],
  };
}

/** Hard upper bound on subscription / redemption rows read for the row-based metrics (MRR, discounted). */
export const MAX_METRIC_ROWS = 50_000;
/** Page size for the paged fetch. Supabase's default PostgREST `max-rows` is 1,000, so a page never asks for more. */
export const METRIC_PAGE_SIZE = 1_000;

/**
 * Reads pages [from, from + pageSize) until a short page or the hard bound. `truncated` is
 * true only when the bound was reached AND at least one more row exists (probed by asking
 * for one row past the bound), so a table of exactly MAX rows is not reported as truncated.
 */
export async function fetchAllPaged<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  opts: { max?: number; pageSize?: number } = {},
): Promise<{ rows: T[]; truncated: boolean }> {
  const max = opts.max ?? MAX_METRIC_ROWS;
  const pageSize = opts.pageSize ?? METRIC_PAGE_SIZE;
  const rows: T[] = [];
  while (rows.length < max) {
    const from = rows.length;
    const to = Math.min(from + pageSize, max) - 1;
    const { data, error } = await fetchPage(from, to);
    if (error) throw new Error(`metrics page ${from}-${to} failed: ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < to - from + 1) return { rows, truncated: false };
  }
  const { data, error } = await fetchPage(max, max);
  if (error) throw new Error(`metrics overflow probe failed: ${error.message}`);
  return { rows, truncated: (data ?? []).length > 0 };
}
