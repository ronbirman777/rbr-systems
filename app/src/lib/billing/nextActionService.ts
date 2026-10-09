import type { BillingDeps } from "./deps";
import { computeNextAction } from "./nextAction";

/**
 * Recompute and persist a subscription's next action. The ONLY writer of the
 * next_action columns; called after every state change so the persisted values
 * (and anything reading them: Admin, My Spaces, Billing) always agree with the
 * single calculator.
 */
export async function refreshNextAction(deps: BillingDeps, subscriptionId: string) {
  const sub = await deps.store.getSubscriptionById(subscriptionId);
  if (!sub) return null;
  const redemption = await deps.store.getRedemptionState(subscriptionId);
  const result = computeNextAction(sub, redemption, { now: deps.now(), nextPaymentAttemptAt: sub.nextPaymentAttemptAt });
  await deps.store.setNextAction(subscriptionId, { action: result.action, at: result.at, expectedChargeMinor: result.expectedChargeMinor });
  return { sub, redemption, result };
}
