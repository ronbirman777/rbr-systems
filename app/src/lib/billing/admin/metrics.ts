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
