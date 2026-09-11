import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import { PublishedSpaceScreen, type PublishedSpaceRow } from "@/components/guest/published-space-screen";
import { isSpacePubliclyAvailable } from "@/lib/entitlements/isSpacePubliclyAvailable";

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

export default async function GuestSpacePage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  const supabase = createPublicClient();

  const { data: space } = await supabase
    .from("published_spaces")
    .select("name, theme, timezone, enabled_modules, modules")
    .eq("tenant_id", tenantId)
    .maybeSingle<PublishedSpaceRow>();

  if (!space) notFound();
  if (!(await isSpacePubliclyAvailable(tenantId))) notFound();

  return <PublishedSpaceScreen space={space} />;
}
