import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { InnerDweSMark } from "@/components/brand/wordmark";
import { PRODUCT_FAMILIES, type ProductTypeKey } from "@/lib/brand/productFamilies";
import { PublishSpaceButton } from "@/components/publish-space-button";
import { deriveCommercialAvailability } from "@/lib/entitlements/availability";
import type { SpaceEntitlementRow } from "@/lib/entitlements/types";

type PublishedRow = { published_at: string } | { published_at: string }[] | null;

/**
 * Self Service Phase 1: formalizes My Spaces per the phase brief - public
 * address display, a "Manage Space" label, a direct-to-live-preview link,
 * and Publish/Republish exposed right on the list (see
 * PublishSpaceButton) rather than only inside the configurator. The
 * underlying data and its RLS scoping (is_tenant_member OR created_by =
 * auth.uid()) are unchanged from before this phase - this page already
 * existed and already got this right; only slug and the inline publish
 * action are new here.
 */
export default async function MySpacePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/log-in");

  // RLS (is_tenant_member OR created_by = auth.uid()) already scopes this to
  // only the signed-in user's own tenants - no separate membership query needed.
  const { data: tenants } = await supabase
    .from("tenants")
    .select("id, name, product_type, status, slug, content_updated_at, published_spaces(published_at)")
    .order("content_updated_at", { ascending: false });

  // Commercial Access Phase 1: one additive query for every listed
  // tenant's entitlement row, fed through the same
  // deriveCommercialAvailability() authority publish_space() enforces
  // server-side - no separate date logic here. A missing row (no
  // redemption yet) is expected and resolves to inactive.
  const tenantIds = (tenants ?? []).map((t) => t.id);
  const { data: entitlementRows } = await supabase
    .from("space_entitlements")
    .select("*")
    .in("tenant_id", tenantIds.length > 0 ? tenantIds : ["00000000-0000-0000-0000-000000000000"]);
  const entitlementByTenant = new Map<string, SpaceEntitlementRow>(
    (entitlementRows ?? []).map((row) => [row.tenant_id, row as SpaceEntitlementRow])
  );

  function publishedAt(row: PublishedRow): string | null {
    if (!row) return null;
    const r = Array.isArray(row) ? row[0] : row;
    return r?.published_at ?? null;
  }

  return (
    <main className="flex-1 bg-idw-parchment px-6 py-16">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between">
          <InnerDweSMark size={26} />
          <Link
            href="/create"
            className="text-xs font-semibold uppercase tracking-wide text-idw-forest border border-idw-forest/20 rounded-full px-4 py-2 hover:border-idw-forest/50 transition-colors"
          >
            + New Space
          </Link>
        </div>
        <h1 className="font-ui text-3xl text-idw-forest mt-8">My Spaces</h1>

        <div className="mt-8 flex flex-col gap-3">
          {(tenants ?? []).length === 0 && (
            <div className="rounded-2xl border border-idw-forest/10 bg-white p-8 text-center text-sm text-idw-forest/60">
              You haven&apos;t created a space yet.{" "}
              <Link href="/create" className="text-idw-forest underline">
                Start one
              </Link>
              .
            </div>
          )}

          {(tenants ?? []).map((t) => {
            const published = publishedAt(t.published_spaces as PublishedRow);
            const hasUnpublishedChanges =
              published && new Date(t.content_updated_at) > new Date(published);
            const family = PRODUCT_FAMILIES[t.product_type as ProductTypeKey];
            const slug = (t as { slug: string | null }).slug;
            const liveHref = slug ? `/s/${slug}` : `/g/${t.id}`;
            const availability = deriveCommercialAvailability(entitlementByTenant.get(t.id) ?? null);

            return (
              <div key={t.id} className="rounded-2xl border border-idw-forest/10 bg-white p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div
                      className="text-xs font-semibold uppercase tracking-[0.12em]"
                      style={{ color: family?.accent ?? "#192B21" }}
                    >
                      {family?.name ?? t.product_type}
                    </div>
                    <div className="font-editorial italic text-xl text-idw-forest mt-1">
                      {t.name}
                    </div>
                    <div className="text-xs text-idw-forest/50 mt-2">
                      {published ? (
                        hasUnpublishedChanges ? (
                          <span>Live · unpublished changes</span>
                        ) : (
                          <span>Live</span>
                        )
                      ) : (
                        <span>Draft</span>
                      )}
                      {" · Updated "}
                      {new Date(t.content_updated_at).toLocaleDateString()}
                    </div>
                    <div className="text-xs text-idw-forest/40 mt-1">
                      {slug ? (
                        <>Public address: {slug}.innerdwes.com</>
                      ) : (
                        <>No public address reserved yet - set one in Manage Space</>
                      )}
                    </div>
                    <div className="text-xs text-idw-forest/40 mt-1">
                      {availability.effectiveStatus === "complimentary" &&
                        `Complimentary access${availability.daysRemaining !== null ? ` · ${availability.daysRemaining}d remaining` : ""}`}
                      {availability.effectiveStatus === "active" &&
                        `Active access${availability.daysRemaining !== null ? ` · ${availability.daysRemaining}d remaining` : ""}`}
                      {availability.effectiveStatus === "grace" &&
                        `Access expired · ${availability.daysRemaining ?? 0}d left before offline`}
                      {availability.effectiveStatus === "inactive" && "No active access"}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-4 mt-5 items-center text-xs font-semibold uppercase tracking-wide">
                  <Link href={`/configurator/retreat/${t.id}`} className="text-idw-forest underline">
                    Manage Space
                  </Link>
                  <Link href={`/configurator/retreat/${t.id}?step=publish`} className="text-idw-forest underline">
                    Preview
                  </Link>
                  <PublishSpaceButton tenantId={t.id} isLive={Boolean(published)} canPublish={availability.canPublish} />
                  {published && (
                    <a href={liveHref} target="_blank" rel="noopener noreferrer" className="text-idw-forest underline">
                      View Live App
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
