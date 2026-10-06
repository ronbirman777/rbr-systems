import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import { socialSpaceByTenantId } from "@/lib/share/publishedSocialSpace";
import { spaceMetadata } from "@/lib/share/socialMetadata";
import type { PublishedSpaceRow } from "@/components/guest/published-space-screen";
import { renderPublishedSpace } from "@/lib/spaceTypes/guestRenderers";
import { guestAccessCopy } from "@/lib/spaceTypes/guestAccessCopy";
import { resolveGuestAccess } from "@/lib/guestAccess/effectiveAccess";
import { GuestAccessScreen } from "@/components/guest/guest-access-screen";
import { extractPublishedGuestIdentity } from "@/lib/guestAccess/publishedIdentity";

import { localeFromPublishedModules } from "@/lib/spaceSettings";
/**
 * The genuinely unauthenticated guest route, looked up by tenant id. No
 * cookies, no session, no Supabase auth of any kind - it queries
 * published_spaces only, through the plain anon/publishable client,
 * selecting only the columns it needs (never `select *`). It never
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
  const supabase = createPublicClient();

  const { data: space } = await supabase
    .from("published_spaces")
    .select("product_type, name, theme, timezone, enabled_modules, modules")
    .eq("tenant_id", tenantId)
    .maybeSingle<PublishedSpaceRow & { product_type: string }>();

  if (!space) notFound();
  // Commercial availability, then guest access code - one shared policy
  // (also enforced by /api/media), see resolveGuestAccess.
  const access = await resolveGuestAccess(tenantId);
  if (access === "unavailable") notFound();
  if (access === "code-required") {
    const identity = extractPublishedGuestIdentity(space);
    // The gate speaks the Space's own language; a visitor's device locale
    // is never consulted, here or anywhere else in a Guest surface.
    const gateLocale = localeFromPublishedModules(space.modules);
    return <GuestAccessScreen tenantId={tenantId} {...identity} copy={guestAccessCopy(space.product_type, gateLocale)} locale={gateLocale} />;
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
