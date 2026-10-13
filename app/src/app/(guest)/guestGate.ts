import "server-only";
import { hasGuestRenderer } from "@/lib/spaceTypes/guestRenderers";
import type { SocialSpace } from "@/lib/share/publishedSocialSpace";

/**
 * TASK 033 fix - the one access decision for a Guest route, taken from the
 * per-request cached loader (socialSpaceBySlug / socialSpaceByTenantId:
 * published row + resolveGuestAccess, exception -> "unavailable").
 *
 *   not-found     no published row (unknown, unpublished, draft-only),
 *                 not publicly available (suspended / commercially
 *                 inactive / access-check exception), or granted but of a
 *                 type with no Guest App - always a 404.
 *   access-screen available but code-protected and this request holds no
 *                 valid cookie - the code entry screen (HTTP 200).
 *   app           available and granted, with a Guest App to render.
 *
 * WHY THIS EXISTS. Once a Suspense fallback is sent the response is
 * committed to 200, and a notFound() inside the stream becomes a soft
 * not-found (200 + noindex), not a 404. The Guest root layouts therefore
 * await this decision BEFORE rendering any boundary, and wrap the page in
 * the branded loading boundary only for "app" - so every denying outcome
 * reaches the page's notFound() pre-stream with a real 404 status, exactly
 * as before TASK 033. The page applies the same order of checks to the same
 * cached object, so layout and page can never disagree.
 */
export type GuestGate = "not-found" | "access-screen" | "app";

export function guestGate(loaded: SocialSpace | null): GuestGate {
  if (!loaded) return "not-found";
  if (loaded.access === "unavailable") return "not-found";
  if (loaded.access === "code-required") return "access-screen";
  return hasGuestRenderer(loaded.row.product_type) ? "app" : "not-found";
}
