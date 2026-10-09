/**
 * TASK 032 - shared billing constants. Every number that also exists in SQL is
 * pinned to the migration text by constants.test.ts, so the two can never
 * drift silently.
 */

/** The single approved base plan ($25 USD / month / Space). */
export const BASE_PLAN_KEY = "space_monthly_usd";

/** Space types that can be bought (a subset of tenants.product_type). */
export const SELLABLE_SPACE_TYPES = ["teach", "retreat"] as const;
export type SellableSpaceType = (typeof SELLABLE_SPACE_TYPES)[number];

const HOUR_MS = 60 * 60 * 1000;

/**
 * Failed-payment timeline, measured from payment_failed_at in FIXED ELAPSED
 * HOURS (never calendar days - no DST drift). Mirrors billing_apply_lifecycle()
 * and space_access_state() in migration 0038.
 */
export const LIFECYCLE_HOURS = {
  /** ~24h unresolved: the Guest App for THAT Space becomes unavailable. */
  guestSuspension: 24,
  /** Day 7 unresolved: Studio for THAT Space is suspended. */
  studioSuspension: 168,
  /** Day 12: final warning that deletion eligibility is approaching. */
  finalWarning: 288,
  /** Day 14: eligible for the deletion WORKFLOW (never an immediate hard delete). */
  deletionEligible: 336,
} as const;

/** Slack after a cancel-at-period-end period closes before access is treated as
 * ended even if the "subscription deleted" webhook was missed (SQL: 6 hours). */
export const CANCEL_SLACK_HOURS = 6;

/** Stripe Checkout Session lifetime (Stripe's minimum is 30 minutes). */
export const CHECKOUT_TTL_MINUTES = 60;
/** A coupon reservation outlives its checkout slightly so a payment completing
 * at the last moment still finds its reservation. */
export const RESERVATION_TTL_MINUTES = 75;

/** Recent-MFA window for dangerous Admin writes (step-up). */
export const ADMIN_STEP_UP_MAX_AGE_SECONDS = 10 * 60;

export const hoursToMs = (h: number) => h * HOUR_MS;
