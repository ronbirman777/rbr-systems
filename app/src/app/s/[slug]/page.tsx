import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { PublishedSpaceRow } from "@/components/guest/published-space-screen";
import { renderPublishedSpace } from "@/lib/spaceTypes/guestRenderers";
import { guestAccessCopy } from "@/lib/spaceTypes/guestAccessCopy";
import { GuestAccessScreen } from "@/components/guest/guest-access-screen";
import { extractPublishedGuestIdentity } from "@/lib/guestAccess/publishedIdentity";
import { socialSpaceBySlug } from "@/lib/share/publishedSocialSpace";
import { spaceMetadata } from "@/lib/share/socialMetadata";

import { localeFromPublishedModules } from "@/lib/spaceSettings";
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

/**
 * Link-preview metadata for the public Guest App address. Built from the
 * same per-request read the page body uses (socialSpaceBySlug is memoised
 * with React cache), so adding social metadata costs no extra query.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const loaded = await socialSpaceBySlug(slug);
  return spaceMetadata(loaded, `/s/${slug}`);
}

export default async function GuestSpaceBySlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const loaded = await socialSpaceBySlug(slug);

  if (!loaded) notFound();
  const space = loaded.row as unknown as PublishedSpaceRow & { tenant_id: string; product_type: string };
  if (loaded.access === "unavailable") notFound();
  if (loaded.access === "code-required") {
    const identity = extractPublishedGuestIdentity(space);
    // The gate speaks the Space's own language; a visitor's device locale
    // is never consulted, here or anywhere else in a Guest surface.
    const gateLocale = localeFromPublishedModules(space.modules);
    return <GuestAccessScreen tenantId={space.tenant_id} {...identity} copy={guestAccessCopy(space.product_type, gateLocale)} locale={gateLocale} />;
  }


  // Space Type Registry: render by the snapshot's own product_type - only
  // AFTER availability and the access code have allowed this request to see
  // the Space, so an unsupported type is indistinguishable from "not
  // available" until then. An unknown type (or one with no guest app) is a
  // plain 404, never another product's app.
  const rendered = renderPublishedSpace(space.product_type, space);
  if (!rendered) notFound();
  return rendered;
}
