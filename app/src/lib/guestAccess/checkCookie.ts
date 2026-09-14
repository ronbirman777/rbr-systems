import "server-only";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { guestAccessCookieName, verifyGuestAccessToken } from "./cookieToken";

/**
 * Whether THIS guest's browser already holds a valid, current-version
 * cookie for this tenant - the check the guest route makes before
 * deciding to show the code-entry screen at all. version is fetched
 * fresh from the database every time (service-role only,
 * get_guest_access_version) rather than trusted from the token itself,
 * so a code reset/rotation invalidates every outstanding cookie on the
 * very next request, with no session store to clean up.
 */
export async function hasValidGuestAccessCookie(tenantId: string): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(guestAccessCookieName(tenantId))?.value;
  if (!token) return false;

  const admin = createAdminClient();
  const { data: version, error } = await admin.rpc("get_guest_access_version", { p_tenant_id: tenantId });
  if (error) {
    // Pre-migration (function doesn't exist yet), or any other failure -
    // fail closed. In practice this is never reached pre-migration
    // anyway, since getGuestAccessMode() (mode.ts) already resolves
    // every tenant to "public" until 0016 is applied, and callers only
    // reach this check after mode === "code".
    return false;
  }
  return verifyGuestAccessToken(token, tenantId, (version as number | null) ?? 0);
}
