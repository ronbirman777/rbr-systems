import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import { PublishedSpaceScreen, type PublishedSpaceRow } from "@/components/guest/published-space-screen";

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
 * lookup key differs.
 *
 * revalidate: guest traffic is many-readers/few-writers (see the Self
 * Service Phase 1 cost-safeguard notes) - a published snapshot only
 * changes on an explicit Republish, so serving it from Next's route cache
 * for up to a minute between republishes is a safe, well-understood
 * staleness tradeoff, not a correctness risk.
 */
export const revalidate = 60;

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

  return <PublishedSpaceScreen space={space} />;
}
