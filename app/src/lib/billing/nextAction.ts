import { lifecycleDeadlines } from "./lifecycle";
import { discountCycleCount, discountedAmountMinor, type DiscountTerms } from "./quote";
import type { NextAction, SubscriptionRecord } from "./types";

/** The active/finished discount attached to a subscription (a coupon_redemptions row, camelCased). */
export type RedemptionState = {
  status: "redeemed" | "completed" | "canceled";
  terms: DiscountTerms;
  cyclesCompleted: number;
  cyclesTotal: number | null; // null = forever
  discountEndsAt: Date | null;
  /** Display code of the coupon (for emails / the Billing page). */
  couponCode?: string | null;
};

export type NextActionResult = {
  action: NextAction;
  at: Date | null;
  /** Expected next charge, before tax, only when reliably known. */
  expectedChargeMinor: number | null;
  currency: string | null;
  /** For UI: "cycle k of N". */
  discountProgress: null | { currentCycle: number; totalCycles: number | null };
};

const NONE: NextActionResult = { action: "none", at: null, expectedChargeMinor: null, currency: null, discountProgress: null };

/**
 * THE single next-action calculator. Admin, My Spaces and the Billing page all
 * call this (or read the columns it persists) - never their own copy - so they
 * cannot disagree about what happens next.
 *
 * "What happens next, and when" for one subscription:
 *   exempt / ended            -> nothing commercial (ended may still carry deletion steps)
 *   payment failure episode   -> the earliest of {Stripe retry, the next unapplied lifecycle deadline}
 *   cancel at period end      -> access ends at the period end
 *   healthy                   -> the next renewal; discount_cycle / discount_ends when a discount is running
 */
export function computeNextAction(
  sub: SubscriptionRecord,
  redemption: RedemptionState | null,
  opts: { now: Date; nextPaymentAttemptAt?: Date | null }
): NextActionResult {
  const { now } = opts;
  const currency = sub.currency;
  if (sub.status === "exempt") return NONE;

  const ended = sub.status === "canceled" || sub.status === "incomplete_expired";

  // Failure episode (also continues after Stripe itself cancels for non-payment).
  if (sub.paymentFailedAt) {
    const d = lifecycleDeadlines(sub.paymentFailedAt);
    const steps: { action: NextAction; at: Date; applied: Date | null }[] = [
      { action: "guest_suspension", at: d.guestSuspendedAt, applied: sub.guestSuspendedAt },
      { action: "studio_suspension", at: d.studioSuspendedAt, applied: sub.studioSuspendedAt },
      { action: "deletion_warning", at: d.finalWarningAt, applied: sub.deletionWarningAt },
      { action: "deletion_eligible", at: d.deletionEligibleAt, applied: sub.eligibleForDeletionAt },
    ];
    const pending = steps.find((s) => !s.applied);
    const retry = !ended && opts.nextPaymentAttemptAt && opts.nextPaymentAttemptAt.getTime() > now.getTime() ? opts.nextPaymentAttemptAt : null;
    if (retry && (!pending || retry.getTime() <= pending.at.getTime())) {
      return { action: "payment_retry", at: retry, expectedChargeMinor: sub.currentEffectiveAmountMinor ?? sub.baseAmountMinor, currency, discountProgress: null };
    }
    if (pending) return { action: pending.action, at: pending.at, expectedChargeMinor: null, currency, discountProgress: null };
    return { ...NONE, currency };
  }

  if (ended || sub.status === "incomplete" || sub.status === "paused") return { ...NONE, currency };

  const periodEnd = sub.currentPeriodEnd;
  if (sub.cancelAtPeriodEnd) {
    return { action: "cancel_at_period_end", at: sub.cancelAt ?? periodEnd, expectedChargeMinor: 0, currency, discountProgress: null };
  }
  if (!periodEnd) return { ...NONE, currency };

  const base = sub.baseAmountMinor;
  if (redemption && base != null) {
    const total = redemption.cyclesTotal ?? discountCycleCount(redemption.terms);
    if (redemption.status === "redeemed") {
      const remaining = total == null ? Infinity : total - redemption.cyclesCompleted;
      if (remaining > 0) {
        return {
          action: "discount_cycle",
          at: periodEnd,
          expectedChargeMinor: discountedAmountMinor(base, redemption.terms),
          currency,
          discountProgress: { currentCycle: redemption.cyclesCompleted + 1, totalCycles: total },
        };
      }
    }
    if (redemption.status === "completed" && redemption.discountEndsAt && sub.currentPeriodStart && redemption.discountEndsAt.getTime() >= sub.currentPeriodStart.getTime()) {
      // The discount finished during the period that is just ending: the next charge is the first full-price one.
      return { action: "discount_ends", at: periodEnd, expectedChargeMinor: base, currency, discountProgress: null };
    }
  }
  return { action: "renewal", at: periodEnd, expectedChargeMinor: sub.currentEffectiveAmountMinor ?? base, currency, discountProgress: null };
}
