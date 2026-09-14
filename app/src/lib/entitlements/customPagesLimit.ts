import type { SpaceEntitlementRow } from "./types";

/**
 * Time to Flow's Custom Pages cap - currently a single flat number for
 * every Space, but read through this function (not inlined at call
 * sites) so a future per-account override doesn't require touching the
 * server action or the UI: `entitlement.custom_pages_limit` doesn't
 * exist as a column yet (no migration applied), so this always falls
 * through to the default today - the moment that column exists, this is
 * the one place that needs to change.
 */
export const DEFAULT_CUSTOM_PAGES_LIMIT = 3;

export function getCustomPagesLimit(
  entitlement: (SpaceEntitlementRow & { custom_pages_limit?: number | null }) | null
): number {
  return entitlement?.custom_pages_limit ?? DEFAULT_CUSTOM_PAGES_LIMIT;
}
