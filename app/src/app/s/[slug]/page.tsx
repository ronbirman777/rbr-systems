import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import type { PublishedSpaceRow } from "@/components/guest/published-space-screen";
import { renderPublishedSpace } from "@/lib/spaceTypes/guestRenderers";
import { getSpaceType } from "@/lib/spaceTypes/registry";
import { isSpacePubliclyAvailable } from "@/lib/entitlements/isSpacePubliclyAvailable";
import { getGuestAccessMode } from "@/lib/guestAccess/mode";
import { hasValidGuestAccessCookie } from "@/lib/guestAccess/checkCookie";
import { GuestAccessScreen } from "@/components/guest/guest-access-screen";
import { extractPublishedGuestIdentity } from "@/lib/guestAccess/publishedIdentity";

/**
 * The slug-addressed counterpart to /g/[tenantId] - same unauthenticated,
 * published_spaces-only lookup (see that route's own comment for the
 * shared invariants), keyed by the public address the organizer reserved
 * instead of the internal tenant id. Exists so a Space's chosen address
 * ("samadhi") is reachable today, at /s/samadhi, before any DNS work
 * happens.
 *
 * This is deliberately the shape Phase 2's wildcard hostname routing
 * reuses: given request hostname "samadhi.innerdwes.com", proxy.ts
 * rewrites straight to this same route - the lookup-by-slug logic (and,
 * since Guest Commercial Enforcement, the availability check below) lives
 * here, unchanged, rather than being duplicated in middleware.
 *
 * No route-level cache (Guest Commercial Enforcement): commercial
 * availability is an authorization decision, not content - it must never
 * stay publicly served past the instant it expires, and must become
 * available again the instant it's reactivated, with no cache window
 * either way. `dynamic = "force-dynamic"` opts this route out of the
 * Full Route Cache entirely so both the published_spaces read and the
 * isSpacePubliclyAvailable() check run fresh on every request.
 */
export const dynamic = "force-dynamic";

export default async function GuestSpaceBySlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = createPublicClient();

  const { data: space } = await supabase
    .from("published_spaces")
    .select("tenant_id, product_type, name, theme, timezone, enabled_modules, modules")
    .eq("slug", slug)
    .maybeSingle<PublishedSpaceRow & { tenant_id: string; product_type: string }>();

  if (!space) notFound();
  // Unknown product_type (or a type with no guest app) fails visibly here,
  // before any gate or renderer - see the Space Type Registry.
  const spaceType = getSpaceType(space.product_type);
  if (!spaceType?.guest) notFound();
  if (!(await isSpacePubliclyAvailable(space.tenant_id))) notFound();

  const mode = await getGuestAccessMode(space.tenant_id);
  if (mode === "code" && !(await hasValidGuestAccessCookie(space.tenant_id))) {
    const identity = extractPublishedGuestIdentity(space);
    return <GuestAccessScreen tenantId={space.tenant_id} {...identity} copy={spaceType.copy.guestAccess} />;
  }

  // Space Type Registry: render by the snapshot's own product_type. An
  // unknown type (or one without a guest app) is a visible 404 - never
  // another product's app.
  const rendered = renderPublishedSpace(space.product_type, space);
  if (!rendered) notFound();
  return rendered;
}
