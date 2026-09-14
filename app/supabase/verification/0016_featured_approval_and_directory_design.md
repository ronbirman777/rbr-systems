# Featured on InnerDweS — Approval Operation & Directory Read Model

Not built tonight (explicitly out of scope per the overnight brief: "Do NOT build a full InnerDweS
Admin Dashboard yet" / "Do not build the entire marketing directory unless it is naturally small and
isolated"). This documents the exact shape for both, so they can be added later without another
migration or a schema rethink.

## Approval operation (Phase 12)

**Not exposed to any authenticated-organizer-callable RPC.** The only way `status` becomes `approved`/
`rejected` is a service-role write, run from a trusted internal context (a one-off script today, a real
admin tool later) - never a Postgres function granted to `authenticated`.

Proposed shape, for whenever that trusted context exists (pseudocode against the `0016` schema, using
`createAdminClient()`):

```ts
async function approveFeaturedListing(tenantId: string, reviewerUserId: string) {
  const admin = createAdminClient();

  // 1. Read the current submission
  const { data: submission } = await admin
    .from("space_featured_submissions")
    .select("description, location, website, instagram, additional_links")
    .eq("tenant_id", tenantId)
    .single();

  // 2. Read current approved-safe Space identity (name + Space Image) -
  //    the same published-safe source Share Your Space already uses,
  //    never a draft ref.
  const { data: tenant } = await admin.from("tenants").select("name").eq("id", tenantId).single();
  const { data: published } = await admin
    .from("published_spaces")
    .select("modules")
    .eq("tenant_id", tenantId)
    .single();
  const spaceImageRef = extractPublishedSpaceImageRef(published?.modules); // brandMediaSchema, same as Hero/Logo

  // 3. Construct the complete approved_snapshot
  const approvedSnapshot = {
    name: tenant.name,
    spaceImageRef,
    description: submission.description,
    location: submission.location,
    website: submission.website,
    instagram: submission.instagram,
    additionalLinks: submission.additional_links,
  };

  // 4. Write - status/review metadata/snapshot together, one update
  await admin
    .from("space_featured_submissions")
    .update({
      status: "approved",
      reviewed_at: new Date().toISOString(),
      reviewed_by: reviewerUserId,
      approved_snapshot: approvedSnapshot,
      approved_at: new Date().toISOString(),
      approved_by: reviewerUserId,
    })
    .eq("tenant_id", tenantId);
}

async function rejectFeaturedListing(tenantId: string, reviewerUserId: string) {
  const admin = createAdminClient();
  // Only status + review metadata - approved_snapshot/approved_at/approved_by
  // are NEVER touched by a rejection, so an existing live listing is never
  // silently unpublished just because a later revision was rejected.
  await admin
    .from("space_featured_submissions")
    .update({ status: "rejected", reviewed_at: new Date().toISOString(), reviewed_by: reviewerUserId })
    .eq("tenant_id", tenantId);
}
```

Both use the admin/service-role client directly against the table (not a new RPC) - `space_featured_submissions` has no RLS write policy for any client role, but `service_role` bypasses RLS by role membership regardless, exactly like every other admin-only operation in this codebase (`isSpacePubliclyAvailable`, the future Stripe webhook).

**Unpublishing an approved listing** (if ever needed) is a separate, explicit operation - setting `approved_snapshot = null` - never a side effect of rejection. Not designed further here since nothing in this batch requires it.

## Directory read model (Phase 13)

Not built as a route tonight - documented and unit-testable as a pure function so the eventual public
directory route is a thin wrapper around already-proven logic, not new untested logic written under
time pressure later.

```ts
export type DirectoryListing = {
  tenantId: string;
  name: string;
  spaceImageUrl: string | null;
  description: string | null;
  location: string | null;
  website: string | null;
  instagram: string | null;
  additionalLinks: { label: string; url: string }[];
};

/** The one rule a directory read must never violate: only rows with a
 * non-null approved_snapshot are eligible, and the snapshot - never the
 * live/editable submission columns - is what gets shown. A `submitted`
 * (pending) revision sitting alongside an existing approved_snapshot
 * must not change what this returns. */
export function toDirectoryListing(
  row: { tenant_id: string; approved_snapshot: unknown }
): DirectoryListing | null {
  if (row.approved_snapshot === null || row.approved_snapshot === undefined) return null;
  const parsed = approvedSnapshotSchema.safeParse(row.approved_snapshot);
  if (!parsed.success) return null; // fail closed, never show a malformed snapshot
  return {
    tenantId: row.tenant_id,
    name: parsed.data.name,
    spaceImageUrl: parsed.data.spaceImageRef ? publicMediaUrl(parsed.data.spaceImageRef) : null,
    description: parsed.data.description,
    location: parsed.data.location,
    website: parsed.data.website,
    instagram: parsed.data.instagram,
    additionalLinks: parsed.data.additionalLinks,
  };
}
```

A future directory route would query `space_featured_submissions` with `.not("approved_snapshot", "is", null)` (via the public/anon client - a new RLS SELECT policy scoped to `approved_snapshot is not null` would be needed for that, not yet added since the directory itself doesn't exist) and map every row through `toDirectoryListing`. This never reads `description`/`location`/`website`/`instagram` (the live, organizer-editable columns) directly - only ever the frozen `approved_snapshot` - which is what makes "pending revision doesn't mutate the live listing" true by construction, not by a runtime check that could be forgotten later.

Tests for `toDirectoryListing` are included in this batch's test suite expansion (Phase 22) even though the route itself isn't built, since the function is small, pure, and exactly the piece most likely to be gotten wrong later under time pressure.
