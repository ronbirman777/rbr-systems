import { LIFECYCLE_HOURS, hoursToMs } from "./constants";

export type LifecycleDeadlines = {
  guestSuspendedAt: Date;
  studioSuspendedAt: Date;
  finalWarningAt: Date;
  deletionEligibleAt: Date;
};

/** Every deadline is the single server timestamp payment_failed_at plus a fixed number of elapsed hours. */
export function lifecycleDeadlines(paymentFailedAt: Date): LifecycleDeadlines {
  const t = paymentFailedAt.getTime();
  return {
    guestSuspendedAt: new Date(t + hoursToMs(LIFECYCLE_HOURS.guestSuspension)),
    studioSuspendedAt: new Date(t + hoursToMs(LIFECYCLE_HOURS.studioSuspension)),
    finalWarningAt: new Date(t + hoursToMs(LIFECYCLE_HOURS.finalWarning)),
    deletionEligibleAt: new Date(t + hoursToMs(LIFECYCLE_HOURS.deletionEligible)),
  };
}

export type LifecyclePhase =
  | "healthy"
  | "payment_issue"
  | "guest_suspended"
  | "studio_suspended"
  | "final_warning"
  | "deletion_eligible";

/** Where a failure episode currently is. Boundaries are inclusive (>=), matching SQL. */
export function lifecyclePhase(paymentFailedAt: Date | null, now: Date): LifecyclePhase {
  if (!paymentFailedAt) return "healthy";
  const d = lifecycleDeadlines(paymentFailedAt);
  const n = now.getTime();
  if (n >= d.deletionEligibleAt.getTime()) return "deletion_eligible";
  if (n >= d.finalWarningAt.getTime()) return "final_warning";
  if (n >= d.studioSuspendedAt.getTime()) return "studio_suspended";
  if (n >= d.guestSuspendedAt.getTime()) return "guest_suspended";
  return "payment_issue";
}
