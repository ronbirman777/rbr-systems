import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSpaceEntitlement } from "./getSpaceEntitlement";
import { deriveCommercialAvailability } from "./availability";

/**
 * The single authority every Guest entry point (/s/[slug], /g/[tenantId],
 * and anything a future wildcard-hostname rewrite points at either of
 * those) calls before rendering a published snapshot. Reuses
 * getSpaceEntitlement() and deriveCommercialAvailability() unchanged -
 * this file adds no new commercial-status rule, just the one thing an
 * anonymous Guest request cannot do itself: read space_entitlements.
 *
 * space_entitlements' only RLS policy is `select` via is_tenant_member() -
 * an anonymous visitor has no auth.uid() and is never a member, so a
 * Guest route using the ordinary public client would always see zero
 * rows and (via deriveCommercialAvailability's own null handling) always
 * resolve to inactive, for every Space, regardless of real entitlement.
 * createAdminClient() is used here specifically to bypass that - approved
 * narrowly for this one server-side read, never for anything returned to
 * the browser. This function's own return type is a plain boolean: no
 * entitlement row shape, no admin-client instance, and no credential of
 * any kind ever leaves this function.
 *
 * "server-only" (checked at build time, not just by convention) makes an
 * accidental import from a Client Component fail the build rather than
 * bundling the service-role key into browser JS.
 */
export async function isSpacePubliclyAvailable(tenantId: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    // Task 011: an archived Space is never publicly available, checked
    // here as defense in depth alongside the published_spaces RLS policy
    // change in 0017_space_management_slots.sql (which already makes an
    // archived tenant's row unreadable to the anon client this function's
    // callers otherwise use) - two independent enforcement layers, not a
    // single point of failure.
    const { data: tenant } = await admin.from("tenants").select("status").eq("id", tenantId).maybeSingle();
    if (tenant?.status === "archived") return false;

    const entitlement = await getSpaceEntitlement(admin, tenantId);
    return deriveCommercialAvailability(entitlement).isPubliclyAvailable;
  } catch {
    // Fail closed: an unexpected error reading commercial status (network
    // failure, unexpected client exception - not the ordinary "no row"
    // case, which getSpaceEntitlement already resolves to null and
    // deriveCommercialAvailability already resolves to inactive) must
    // never result in showing a Space publicly.
    return false;
  }
}
