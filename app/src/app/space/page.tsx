import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { InnerDweSMark } from "@/components/brand/wordmark";
import { PRODUCT_FAMILIES, type ProductTypeKey } from "@/lib/brand/productFamilies";
import { PublishSpaceButton } from "@/components/publish-space-button";
import { deriveCommercialAvailability } from "@/lib/entitlements/availability";
import type { SpaceEntitlementRow } from "@/lib/entitlements/types";
import { SpaceThumbnail } from "@/components/space-thumbnail";
import { MEDIA_BUCKET } from "@/lib/media/path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSpaceSlotSummary } from "@/app/configurator/retreat/lifecycleActions";
import { SpaceLifecycleControls } from "@/components/space-lifecycle-controls";
import { SpaceOpenLink } from "@/components/space-open-link";
import { signOut } from "@/app/(auth)/actions";
import { LogoutButton } from "@/components/logout-button";

type PublishedRow = { published_at: string } | { published_at: string }[] | null;

/** Same signed-URL-via-RLS-scoped-session pattern used everywhere else a
 * draft Storage object is previewed to its own organizer (see
 * configurator/retreat/[tenantId]/page.tsx's resolveImageUrl). */
async function resolveSpaceImageUrl(supabase: SupabaseClient, imageRef: string | null): Promise<string | null> {
  if (!imageRef) return null;
  const { data: signed } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(imageRef, 3600);
  return signed?.signedUrl ?? null;
}

// Task 011 (logout requirement): explicit, matching the same declaration
// already on /g/[tenantId] - this route reads cookies (auth.getUser())
// so Next.js already treats it as dynamic and already sends
// `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`
// (directly observed on this exact route during Task 009's verification);
// this export makes that explicit rather than implicit, so a browser's
// back-forward cache is never eligible to restore a stale authenticated
// snapshot of this page after sign-out.
export const dynamic = "force-dynamic";

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

  // Task 011 (item B, login/My Spaces performance): tenants, this user's
  // own membership roles, and their slot summary are all independent -
  // none of them needs another's result, only user.id (already known) -
  // so they run as one parallel phase instead of three sequential round
  // trips. RLS (is_tenant_member OR created_by = auth.uid()) already
  // scopes the tenants query to only the signed-in user's own tenants -
  // no separate membership query is needed for THAT scoping; the
  // per-tenant role lookup below exists only to gate owner-only lifecycle
  // controls. Archived tenants remain visible here on purpose (Task 011:
  // Archive is retention, not deletion) - they are just rendered/
  // controlled differently below.
  const [{ data: tenants }, { data: ownRoles }, slots] = await Promise.all([
    supabase
      .from("tenants")
      .select("id, name, product_type, status, slug, content_updated_at, published_spaces(published_at)")
      .order("content_updated_at", { ascending: false }),
    supabase.from("tenant_members").select("tenant_id, role").eq("user_id", user.id),
    getSpaceSlotSummary(user.id),
  ]);
  const roleByTenant = new Map<string, string>((ownRoles ?? []).map((r) => [r.tenant_id, r.role]));

  // These two both need tenantIds (just resolved above) but are
  // independent of each other - run together rather than one after the
  // other.
  const tenantIds = (tenants ?? []).map((t) => t.id);
  const [{ data: entitlementRows }, { data: brandRows }] = await Promise.all([
    // Commercial Access Phase 1: one additive query for every listed
    // tenant's entitlement row, fed through the same
    // deriveCommercialAvailability() authority publish_space() enforces
    // server-side - no separate date logic here. A missing row (no
    // redemption yet) is expected and resolves to inactive.
    supabase
      .from("space_entitlements")
      .select("*")
      .in("tenant_id", tenantIds.length > 0 ? tenantIds : ["00000000-0000-0000-0000-000000000000"]),
    // Manual QA Fixes phase - Space Image, resolved the same way as every
    // other draft Storage preview on this page's sibling
    // (configurator/retreat/[tenantId]/page.tsx): a fresh signed URL per
    // request, through the signed-in user's own RLS-scoped session, never
    // a persisted/cached URL. One query for every listed tenant's
    // brand_configs row, then resolved in parallel below.
    supabase
      .from("brand_configs")
      .select("tenant_id, space_image_ref")
      .in("tenant_id", tenantIds.length > 0 ? tenantIds : ["00000000-0000-0000-0000-000000000000"]),
  ]);
  const entitlementByTenant = new Map<string, SpaceEntitlementRow>(
    (entitlementRows ?? []).map((row) => [row.tenant_id, row as SpaceEntitlementRow])
  );
  const spaceImageUrlByTenant = new Map<string, string | null>(
    await Promise.all(
      (brandRows ?? []).map(
        async (row) => [row.tenant_id, await resolveSpaceImageUrl(supabase, row.space_image_ref)] as const
      )
    )
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
          {/* Task 011: the same "logo links home" convention MarketingNav
              already uses (src/components/marketing/nav.tsx) - reused here,
              not a new navigation pattern, so the owner always has a clear,
              intentional way back to the main InnerDweS site from My
              Spaces (Main site <-> My Spaces <-> Space Studio). */}
          <Link href="/" aria-label="Back to InnerDweS home" className="flex items-center">
            <InnerDweSMark size={26} />
          </Link>
          {slots.slotsAvailable > 0 ? (
            <Link
              href="/create"
              className="text-xs font-semibold uppercase tracking-wide text-idw-forest border border-idw-forest/20 rounded-full px-4 py-2 hover:border-idw-forest/50 transition-colors"
            >
              + New Space
            </Link>
          ) : (
            <span
              className="text-xs font-semibold uppercase tracking-wide text-idw-forest/30 border border-idw-forest/10 rounded-full px-4 py-2 cursor-not-allowed"
              title="No available Space slots - replace an existing Space or add a slot"
            >
              + New Space
            </span>
          )}
        </div>
        {/* Task 011, added after Ron's real-iPhone final QA: the logo link
            alone wasn't an "understandable visible action" for returning
            home, and there was no way to log out at all from My Spaces -
            both real gaps, not covered by the earlier Studio/My-Spaces
            navigation work. A small, restrained utility row (not a redesign)
            - both items are real >=44px (min-h-11) touch targets. signOut()
            is the existing (auth)/actions.ts Supabase sign-out - no second
            auth implementation. */}
        <div className="flex items-center gap-1 mt-3">
          <Link
            href="/"
            className="inline-flex items-center min-h-11 px-3 -ml-3 rounded-lg text-xs font-semibold uppercase tracking-wide text-idw-forest/60 active:bg-idw-forest/10 hover:text-idw-forest transition-colors"
          >
            Home
          </Link>
          <form action={signOut}>
            <LogoutButton />
          </form>
        </div>
        <h1 className="font-ui text-3xl text-idw-forest mt-8">My Spaces</h1>
        {/* Task 011: slots used/allowed/available, always derived, never a
            separately-persisted count. */}
        <p className="text-xs text-idw-forest/50 mt-2">
          {slots.slotsUsed} of {slots.slotsAllowed} Space {slots.slotsAllowed === 1 ? "slot" : "slots"} used
          {slots.slotsAvailable > 0 ? ` · ${slots.slotsAvailable} available` : " · none available"}
        </p>

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
            const spaceImageUrl = spaceImageUrlByTenant.get(t.id) ?? null;
            const isArchived = t.status === "archived";
            const isOwner = roleByTenant.get(t.id) === "owner";

            return (
              <div
                key={t.id}
                className={`rounded-2xl border p-6 ${isArchived ? "border-idw-forest/10 bg-idw-forest/[0.03]" : "border-idw-forest/10 bg-white"}`}
              >
                <div className="flex items-start gap-4">
                  <SpaceThumbnail
                    imageUrl={spaceImageUrl}
                    alt={`${t.name} cover`}
                    className={`w-20 h-20 rounded-xl shrink-0 ${isArchived ? "opacity-50" : ""}`}
                  />
                  <div className="flex-1 min-w-0">
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
                      {isArchived ? (
                        <span>Archived · not public</span>
                      ) : published ? (
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
                    {!isArchived && (
                      <>
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
                      </>
                    )}
                    {isArchived && (
                      <div className="text-xs text-idw-forest/40 mt-1">
                        Still uses one Space slot. Restore to manage/publish again, or replace it
                        to reuse the slot for something new.
                      </div>
                    )}
                  </div>
                </div>
                {/* Task 011, revised after real-iPhone QA: these were plain
                    underlined text links - an easy-to-miss touch surface
                    with no press feedback, which is exactly why repeated
                    taps felt necessary. Now real >=44px chip buttons
                    (min-h-11), same uppercase/tracking-wide/idw-forest
                    visual language as the existing "+ New Space" chip
                    elsewhere on this page (not a redesign), with a visible
                    :active press state for touch AND mouse. */}
                <div className="flex flex-wrap gap-2.5 mt-5 items-center text-xs font-semibold uppercase tracking-wide">
                  {!isArchived && (
                    <>
                      <SpaceOpenLink
                        href={`/configurator/retreat/${t.id}`}
                        className="inline-flex items-center justify-center min-h-11 px-4 rounded-full border border-idw-forest/20 text-idw-forest active:scale-[0.97] active:bg-idw-forest/10 transition-transform"
                      >
                        Manage Space
                      </SpaceOpenLink>
                      <SpaceOpenLink
                        href={`/configurator/retreat/${t.id}?step=publish`}
                        className="inline-flex items-center justify-center min-h-11 px-4 rounded-full border border-idw-forest/20 text-idw-forest active:scale-[0.97] active:bg-idw-forest/10 transition-transform"
                      >
                        Preview
                      </SpaceOpenLink>
                      <PublishSpaceButton tenantId={t.id} isLive={Boolean(published)} canPublish={availability.canPublish} />
                      {published && (
                        // External, opens a new tab - deliberately NOT a
                        // SpaceOpenLink: this page's own navigation state
                        // never changes, so it must never show a
                        // persistent "loading" state (Ron's explicit
                        // requirement) - only a brief :active press
                        // acknowledgement, same as every other chip here.
                        <a
                          href={liveHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center min-h-11 px-4 rounded-full border border-idw-forest/20 text-idw-forest active:scale-[0.97] active:bg-idw-forest/10 transition-transform"
                        >
                          View Live App
                        </a>
                      )}
                    </>
                  )}
                  {isOwner && (
                    <SpaceLifecycleControls
                      tenantId={t.id}
                      name={t.name}
                      isArchived={isArchived}
                      slotsAvailable={slots.slotsAvailable}
                    />
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
