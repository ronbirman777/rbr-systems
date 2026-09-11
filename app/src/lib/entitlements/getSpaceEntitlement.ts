import type { SupabaseClient } from "@supabase/supabase-js";
import type { SpaceEntitlementRow } from "./types";

/**
 * Fetches a tenant's current commercial entitlement row, if any. No row is
 * a real, expected outcome for a Space that has never redeemed a
 * complimentary code (or, later, started a paid subscription) - callers
 * pass the result straight into deriveCommercialAvailability, which
 * already treats `null` as `inactive`.
 */
export async function getSpaceEntitlement(
  supabase: SupabaseClient,
  tenantId: string
): Promise<SpaceEntitlementRow | null> {
  const { data } = await supabase
    .from("space_entitlements")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  return data as SpaceEntitlementRow | null;
}
