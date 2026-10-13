import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { socialSpaceByTenantId } from "@/lib/share/publishedSocialSpace";
import { spaceMetadata } from "@/lib/share/socialMetadata";
import type { PublishedSpaceRow } from "@/components/guest/published-space-screen";
import { renderPublishedSpace } from "@/lib/spaceTypes/guestRenderers";
import { guestAccessCopy } from "@/lib/spaceTypes/guestAccessCopy";
import { GuestAccessScreen } from "@/components/guest/guest-access-screen";
import { extractPublishedGuestIdentity } from "@/lib/guestAccess/publishedIdentity";

import { localeFromPublishedModules } from "@/lib/spaceSettings";
import { guestMessages } from "@/lib/i18n/guestMessages";
/**
 * The genuinely unauthenticated guest route, looked up by tenant id. No
 * cookies, no session, no Supabase auth of any kind - it queries
 * published_spaces only, through the plain anon/publishable client,
 * selecting only the columns it needs (never `select *`; since TASK 033
 * through the shared socialSpaceByTenantId loader). It never
 * touches tenants, tenant_members, brand_configs, schedule_items, or
 * module_items: not "shouldn't", the code simply doesn't reference them,
 * and RLS would block it even if it tried. This is the customer's
 * application, not InnerDweS's - no platform chrome, no InnerDweS
 * branding, just their own theme.
 *
 * Self Service Phase 1 adds the slug-addressed counterpart at
 * /s/[slug] (see that route) - this one is unchanged and keeps working
 * during the transition, exactly as required. Both routes share their
 * fetched-row shaping and rendering via PublishedSpaceScreen; only the
 * lookup key differs. Kept fully public and fully enforced (Guest
 * Commercial Enforcement) rather than deprecated - still the only public
 * address for a Space that published without reserving a slug.
 *
 * No route-level cache (Guest Commercial Enforcement): commercial
 * availability is an authorization decision, not content - see the
 * matching comment in /s/[slug]/page.tsx for why this can no longer use
 * Next's route cache the way it did before.
 */
export const dynamic = "force-dynamic";

/**
 * Link-preview metadata for the id-addressed address. A Space that has
 * reserved a slug canonicalises to /s/<slug> - that is the address worth
 * sharing, and the one that owns the generated preview image - so this
 * route carries the title/description and points at it rather than
 * growing an image route of its own.
 */
export async function generateMetadata({ params }: { params: Promise<{ tenantId: string }> }): Promise<Metadata> {
  const { tenantId } = await params;
  const loaded = await socialSpaceByTenantId(tenantId);
  return spaceMetadata(loaded, loaded?.slug ? `/s/${loaded.slug}` : `/g/${tenantId}`);
}

export default async function GuestSpacePage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  // TASK 033: the same React-cached loader the layout and generateMetadata
  // use, so the published_spaces read and the availability/access chain
  // run ONCE per request instead of twice (layout + page). It reads the
  // same published row through the same public client, and resolves access
  // through the same resolveGuestAccess(); the one difference from the old
  // inline chain is that an access-check exception fails closed as
  // "unavailable" (a 404) instead of surfacing as a 500 - exactly what
  // /s/[slug] has always done.
  const loaded = await socialSpaceByTenantId(tenantId);

  if (!loaded) notFound();
  const space = loaded.row as unknown as PublishedSpaceRow & { product_type: string };
  // Commercial availability, then guest access code - one shared policy
  // (also enforced by /api/media), see resolveGuestAccess.
  if (loaded.access === "unavailable") notFound();
  if (loaded.access === "code-required") {
    const identity = extractPublishedGuestIdentity(space);
    // The gate speaks the Space's own language; a visitor's device locale
    // is never consulted, here or anywhere else in a Guest surface.
    const gateLocale = localeFromPublishedModules(space.modules);
    return <GuestAccessScreen tenantId={tenantId} {...identity} copy={guestAccessCopy(space.product_type, gateLocale)} locale={gateLocale} messages={guestMessages(gateLocale)} />;
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
