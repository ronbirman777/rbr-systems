import "server-only";
import { isSpacePubliclyAvailable } from "@/lib/entitlements/isSpacePubliclyAvailable";
import { getGuestAccessMode, type GuestAccessMode } from "./mode";
import { hasValidGuestAccessCookie } from "./checkCookie";

/**
 * "Can THIS request currently see this published Space?" - the one shared
 * answer used by the Guest App routes (/g/[tenantId], /s/[slug]) and by the
 * published-media route (/api/media). Product-agnostic: it takes a tenant
 * id and nothing else, so Flow and any later product share it unchanged.
 *
 *   "unavailable"   - the Space is not currently publicly available
 *                     (commercially inactive, archived, or an unexpected
 *                     error reading that state - always fail closed).
 *                     Checked FIRST: a lapsed Space's access code can
 *                     never be used to route around it.
 *   "code-required" - available, protected by a guest access code, and
 *                     this request has no valid current-version cookie.
 *   "granted"       - available, and either public or this request holds
 *                     a valid, Space-scoped, current-version cookie.
 *
 * Nothing here trusts the client: commercial state and the access-code
 * version are read fresh from the database on every call, and the cookie
 * is HMAC-verified against that live version (see checkCookie.ts).
 */
export type GuestAccessState = "unavailable" | "code-required" | "granted";

/**
 * The same answer, plus the Space's access mode.
 *
 * "granted" alone cannot distinguish a genuinely public Space from a
 * code-protected one whose visitor holds a valid cookie, and /api/media
 * must tell them apart to decide whether a response may be cached
 * publicly. The mode is already read here, so returning it costs nothing
 * - asking for it again afterwards would be an extra database round trip
 * per image, which is the opposite of what CP4 is for.
 */
export type GuestAccessDetail = {
  state: GuestAccessState;
  /** Null only when the Space is unavailable, where mode is not consulted. */
  mode: GuestAccessMode | null;
};

export async function resolveGuestAccessDetailed(tenantId: string): Promise<GuestAccessDetail> {
  if (!(await isSpacePubliclyAvailable(tenantId))) return { state: "unavailable", mode: null };

  const mode = await getGuestAccessMode(tenantId);
  if (mode === "code" && !(await hasValidGuestAccessCookie(tenantId))) return { state: "code-required", mode };

  return { state: "granted", mode };
}

export async function resolveGuestAccess(tenantId: string): Promise<GuestAccessState> {
  return (await resolveGuestAccessDetailed(tenantId)).state;
}
