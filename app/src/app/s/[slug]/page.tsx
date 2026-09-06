import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import { PublishedSpaceScreen, type PublishedSpaceRow } from "@/components/guest/published-space-screen";

/**
 * The slug-addressed counterpart to /g/[tenantId] - same unauthenticated,
 * published_spaces-only lookup (see that route's own comment for the
 * shared invariants), keyed by the public address the organizer reserved
 * instead of the internal tenant id. Exists so a Space's chosen address
 * ("samadhi") is reachable today, at /s/samadhi, before any DNS work
 * happens.
 *
 * This is deliberately the shape Phase 2's wildcard hostname routing will
 * reuse: given request hostname "samadhi.innerdwes.com", a future
 * middleware only needs to extract "samadhi" and rewrite to this same
 * route (NextResponse.rewrite) - the lookup-by-slug logic already lives
 * here, unchanged, rather than being invented later. No DNS or wildcard
 * routing is configured in this phase; only this path exists.
 */
export const revalidate = 60;

export default async function GuestSpaceBySlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = createPublicClient();

  const { data: space } = await supabase
    .from("published_spaces")
    .select("name, theme, timezone, enabled_modules, modules")
    .eq("slug", slug)
    .maybeSingle<PublishedSpaceRow>();

  if (!space) notFound();

  return <PublishedSpaceScreen space={space} />;
}
