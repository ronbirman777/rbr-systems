import { CANCEL_SLACK_HOURS, LIFECYCLE_HOURS, hoursToMs } from "./constants";
import type { SubscriptionRecord } from "./types";

export type AccessReason =
  | "no_subscription" | "exempt" | "exemption_expired" | "active" | "payment_issue"
  | "guest_suspended" | "studio_suspended" | "subscription_ended" | "subscription_not_active";

export type AccessDecision = {
  /** false = no usable billing row: the caller falls back to the legacy entitlement derivation. */
  decided: boolean;
  /** May the owner write Studio content / upload media / publish. */
  studioWritable: boolean;
  /** Is the Guest App publicly available. null when undecided. */
  guestAvailable: boolean | null;
  canPublish: boolean | null;
  reason: AccessReason;
};

export type AccessInput = Pick<
  SubscriptionRecord,
  "status" | "cancelAtPeriodEnd" | "currentPeriodEnd" | "paymentFailedAt" | "exemptExpiresAt"
>;

const undecided = (reason: AccessReason): AccessDecision =>
  ({ decided: false, studioWritable: true, guestAvailable: null, canPublish: null, reason });
const decided = (studioWritable: boolean, guestAvailable: boolean, canPublish: boolean, reason: AccessReason): AccessDecision =>
  ({ decided: true, studioWritable, guestAvailable, canPublish, reason });

/**
 * THE unified billing access decision (TypeScript twin of space_access_state()
 * in migration 0038). Both implementations are driven by the same vectors in
 * vectors/accessVectors.json, so they cannot drift.
 *
 * Suspension never touches content or the published snapshot: it only changes
 * whether the Space is currently available. Recovery therefore restores the
 * Guest App with no republish.
 */
export function deriveSpaceAccess(sub: AccessInput | null, now: Date = new Date()): AccessDecision {
  if (!sub) return undecided("no_subscription");
  const n = now.getTime();

  if (sub.status === "exempt") {
    if (sub.exemptExpiresAt && n >= sub.exemptExpiresAt.getTime()) return undecided("exemption_expired");
    return decided(true, true, true, "exempt");
  }

  const ended =
    sub.status === "canceled" ||
    sub.status === "incomplete_expired" ||
    (sub.cancelAtPeriodEnd && sub.currentPeriodEnd != null && n > sub.currentPeriodEnd.getTime() + hoursToMs(CANCEL_SLACK_HOURS));
  if (ended) return decided(false, false, false, "subscription_ended");
  if (sub.status === "incomplete" || sub.status === "paused") return decided(false, false, false, "subscription_not_active");

  if (sub.paymentFailedAt) {
    const f = sub.paymentFailedAt.getTime();
    if (n >= f + hoursToMs(LIFECYCLE_HOURS.studioSuspension)) return decided(false, false, false, "studio_suspended");
    if (n >= f + hoursToMs(LIFECYCLE_HOURS.guestSuspension)) return decided(true, false, true, "guest_suspended");
    return decided(true, true, true, "payment_issue");
  }
  return decided(true, true, true, "active");
}
