import type { SpaceEntitlementRow, CommercialAvailability, EffectiveStatus } from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The grace period, defined as exactly 168 hours (7 * 24h) - a fixed
 * elapsed duration, not "7 calendar days". Not stored anywhere (see
 * SpaceEntitlementRow's comment on why a stored generated column doesn't
 * work here) - always added at read time.
 *
 * Deliberately matches SQL's `interval '168 hours'` (used in
 * publish_space() and redeem_access_code(), both in
 * supabase/migrations/0013_commercial_entitlements.sql) rather than
 * `interval '7 days'`: in Postgres, an interval's hours component is
 * always a fixed elapsed duration, while its days component is
 * calendar-relative and can differ from a fixed 24h*7 span across a DST
 * transition in the evaluating session's timezone. Using hours on the
 * SQL side makes the two languages compute the exact same instant
 * unconditionally - not merely "the same as long as the session
 * timezone happens to be UTC". If this constant ever changes, every
 * inline `interval '168 hours'` occurrence in that migration must change
 * with it.
 */
const GRACE_PERIOD_MS = 7 * MS_PER_DAY;

/**
 * The single reusable commercial-availability authority (Time to Flow
 * Commercial Access Phase 1). Studio's publish gate uses this same
 * derivation today; the Guest route will use it too in a follow-up batch
 * rather than re-implementing the date comparisons - do not duplicate
 * this logic anywhere else.
 *
 * Boundary-identical to the SQL guards in publish_space() and
 * redeem_access_code() (both in
 * supabase/migrations/0013_commercial_entitlements.sql) - <= at both
 * access_ends_at and access_ends_at + 168 hours, in both places, and
 * grace end is derived inline in both places too (nowhere is it a
 * stored column). If this ever changes, that migration's comments point
 * back here and must change with it.
 *
 * No entitlement row is a real, permanent, expected state - not a
 * loading/transitional one - for any Space that has never redeemed a
 * complimentary code or (later) started a paid subscription. It resolves
 * to "inactive": full Studio access, no Publish, not publicly available.
 * This is not an automatic trial; nothing ever grants a fresh row on its
 * own.
 */
export function deriveCommercialAvailability(
  entitlement: SpaceEntitlementRow | null,
  now: Date = new Date()
): CommercialAvailability {
  if (!entitlement) {
    return {
      accessType: null,
      effectiveStatus: "inactive",
      accessEndsAt: null,
      graceEndsAt: null,
      daysRemaining: null,
      canManage: true,
      canPublish: false,
      isPubliclyAvailable: false,
    };
  }

  const nowMs = now.getTime();
  const accessEndsAtMs = new Date(entitlement.access_ends_at).getTime();
  // Derived, not read off the row - see GRACE_PERIOD_MS above.
  const graceEndsAtMs = accessEndsAtMs + GRACE_PERIOD_MS;

  let effectiveStatus: EffectiveStatus;
  let daysRemaining: number | null;

  if (nowMs <= accessEndsAtMs) {
    // Inclusive: access is still valid THROUGH the exact end instant.
    effectiveStatus = entitlement.access_type;
    daysRemaining = Math.ceil((accessEndsAtMs - nowMs) / MS_PER_DAY);
  } else if (nowMs <= graceEndsAtMs) {
    // Inclusive: grace still applies THROUGH its own exact end instant.
    effectiveStatus = "grace";
    daysRemaining = Math.ceil((graceEndsAtMs - nowMs) / MS_PER_DAY);
  } else {
    effectiveStatus = "inactive";
    daysRemaining = null;
  }

  const isUsable =
    effectiveStatus === "complimentary" || effectiveStatus === "active" || effectiveStatus === "grace";

  return {
    accessType: entitlement.access_type,
    effectiveStatus,
    accessEndsAt: entitlement.access_ends_at,
    graceEndsAt: new Date(graceEndsAtMs).toISOString(),
    daysRemaining,
    canManage: true,
    canPublish: isUsable,
    isPubliclyAvailable: isUsable,
  };
}
