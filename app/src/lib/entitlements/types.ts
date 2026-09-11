/**
 * Time to Flow Commercial Access Phase 1. Shared types for the entitlement
 * model - see availability.ts for the derivation logic that consumes
 * these, and supabase/migrations/0013_commercial_entitlements.sql for the
 * database shape these mirror exactly.
 */

/** How the current grant was obtained. "active" is reserved for Stripe
 * (Phase 2) - nothing in this phase ever sets it. */
export type AccessType = "complimentary" | "active";

/** The derived, effective state - never stored, always computed fresh
 * from access_type + access_ends_at + now() (grace_ends_at is itself
 * derived from access_ends_at - see deriveCommercialAvailability). */
export type EffectiveStatus = "complimentary" | "active" | "grace" | "inactive";

/** One row from public.space_entitlements - the tenant's current
 * commercial state. No row for a tenant is a real, permanent, expected
 * condition (not a loading/transitional state) - see
 * deriveCommercialAvailability's own handling of `null`.
 *
 * access_ends_at is the ONLY persisted end-of-period timestamp. There is
 * no grace_ends_at column - a `generated ... stored` column computing
 * access_ends_at + interval '7 days' was attempted and rejected by
 * Postgres (error 42P17: generation expression is not immutable -
 * timestamptz + a calendar-day interval is timezone/DST-dependent, so it
 * can't back a STORED generated column). Grace end is instead derived at
 * read time as exactly 168 hours (7 * 24h, a fixed elapsed duration, not
 * "7 calendar days") past access_ends_at - identically in SQL (inline
 * access_ends_at + interval '168 hours' in publish_space() and
 * redeem_access_code()) and in TypeScript (deriveCommercialAvailability,
 * below) - never stored anywhere. */
export type SpaceEntitlementRow = {
  tenant_id: string;
  access_type: AccessType;
  starts_at: string;
  access_ends_at: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
};

/**
 * The single authority for "what can this Space currently do commercially" -
 * Studio's publish gate today, and the Guest route in a follow-up batch,
 * both derive through this shape rather than re-implementing date
 * comparisons themselves.
 */
export type CommercialAvailability = {
  accessType: AccessType | null;
  effectiveStatus: EffectiveStatus;
  accessEndsAt: string | null;
  graceEndsAt: string | null;
  /** Days remaining until the next meaningful transition - until
   * accessEndsAt while complimentary/active, until graceEndsAt while in
   * grace, null once inactive (nothing left to count down). */
  daysRemaining: number | null;
  canManage: boolean;
  canPublish: boolean;
  isPubliclyAvailable: boolean;
};
