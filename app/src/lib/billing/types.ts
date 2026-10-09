/** Mirrors space_subscriptions.status (migration 0036). */
export const SUBSCRIPTION_STATUSES = [
  "incomplete", "incomplete_expired", "trialing", "active", "past_due", "unpaid", "canceled", "paused", "exempt",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const NEXT_ACTIONS = [
  "renewal", "discount_cycle", "discount_ends", "cancel_at_period_end", "payment_retry",
  "guest_suspension", "studio_suspension", "deletion_warning", "deletion_eligible", "none",
] as const;
export type NextAction = (typeof NEXT_ACTIONS)[number];

export type StripeMode = "test" | "live";

/** A space_subscriptions row, camelCased, dates as Date. */
export type SubscriptionRecord = {
  id: string;
  tenantId: string;
  billingOwnerUserId: string | null;
  planId: string | null;
  stripeMode: StripeMode | null;
  stripeSubscriptionId: string | null;
  status: SubscriptionStatus;
  currency: string | null;
  baseAmountMinor: number | null;
  currentEffectiveAmountMinor: number | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  cancelAt: Date | null;
  canceledAt: Date | null;
  endedAt: Date | null;
  paymentFailedAt: Date | null;
  guestSuspendedAt: Date | null;
  studioSuspendedAt: Date | null;
  deletionWarningAt: Date | null;
  eligibleForDeletionAt: Date | null;
  recoveredAt: Date | null;
  nextAction: NextAction;
  nextActionAt: Date | null;
  nextExpectedChargeMinor: number | null;
  nextPaymentAttemptAt: Date | null;
  exemptReason: string | null;
  exemptExpiresAt: Date | null;
};

export type SubscriptionRow = {
  id: string; tenant_id: string; billing_owner_user_id: string | null; plan_id: string | null;
  stripe_mode: StripeMode | null; stripe_subscription_id: string | null; status: SubscriptionStatus;
  currency: string | null; base_amount_minor: number | null; current_effective_amount_minor: number | null;
  current_period_start: string | null; current_period_end: string | null; cancel_at_period_end: boolean;
  cancel_at: string | null; canceled_at: string | null; ended_at: string | null; payment_failed_at: string | null;
  guest_suspended_at: string | null; studio_suspended_at: string | null; deletion_warning_at: string | null;
  eligible_for_deletion_at: string | null; recovered_at: string | null; next_action: NextAction;
  next_action_at: string | null; next_expected_charge_minor: number | null; next_payment_attempt_at: string | null; exempt_reason: string | null;
  exempt_expires_at: string | null;
};

const d = (v: string | null) => (v ? new Date(v) : null);

export function toSubscriptionRecord(r: SubscriptionRow): SubscriptionRecord {
  return {
    id: r.id, tenantId: r.tenant_id, billingOwnerUserId: r.billing_owner_user_id, planId: r.plan_id,
    stripeMode: r.stripe_mode, stripeSubscriptionId: r.stripe_subscription_id, status: r.status,
    currency: r.currency, baseAmountMinor: r.base_amount_minor, currentEffectiveAmountMinor: r.current_effective_amount_minor,
    currentPeriodStart: d(r.current_period_start), currentPeriodEnd: d(r.current_period_end),
    cancelAtPeriodEnd: r.cancel_at_period_end, cancelAt: d(r.cancel_at), canceledAt: d(r.canceled_at), endedAt: d(r.ended_at),
    paymentFailedAt: d(r.payment_failed_at), guestSuspendedAt: d(r.guest_suspended_at), studioSuspendedAt: d(r.studio_suspended_at),
    deletionWarningAt: d(r.deletion_warning_at), eligibleForDeletionAt: d(r.eligible_for_deletion_at), recoveredAt: d(r.recovered_at),
    nextAction: r.next_action, nextActionAt: d(r.next_action_at), nextExpectedChargeMinor: r.next_expected_charge_minor,
    nextPaymentAttemptAt: d(r.next_payment_attempt_at),
    exemptReason: r.exempt_reason, exemptExpiresAt: d(r.exempt_expires_at),
  };
}

export const SUBSCRIPTION_SELECT =
  "id, tenant_id, billing_owner_user_id, plan_id, stripe_mode, stripe_subscription_id, status, currency, base_amount_minor, current_effective_amount_minor, current_period_start, current_period_end, cancel_at_period_end, cancel_at, canceled_at, ended_at, payment_failed_at, guest_suspended_at, studio_suspended_at, deletion_warning_at, eligible_for_deletion_at, recovered_at, next_action, next_action_at, next_expected_charge_minor, next_payment_attempt_at, exempt_reason, exempt_expires_at";
