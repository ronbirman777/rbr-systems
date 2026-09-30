import type { SupabaseClient } from "@supabase/supabase-js";
import { MEDIA_BUCKET, isTenantId } from "./path";

/**
 * Thrown by any Storage operation this module performs - the caller
 * (deleteSpaceCompletely, configurator/retreat/lifecycleActions.ts) must
 * never proceed to delete_space()'s database rows if this throws, so a
 * failed cleanup always leaves the Space - and every file it still has -
 * completely intact and safely retryable, never orphaned with no owning
 * tenant left to retry the cleanup from.
 */
export class TenantMediaCleanupError extends Error {}

/**
 * Recursively enumerates every real Storage object under a tenant's own
 * top-level folder ("{tenantId}/...", the existing convention from
 * lib/media/path.ts - tenantMediaPath/publishedMediaPath). Storage's
 * list() returns only one folder level at a time, and represents a
 * sub-folder as a pseudo-entry with `id: null` and no real file behind it
 * (Supabase Storage's documented shape for a "directory" listing) - a
 * real object at any depth (today: {tenantId}/{moduleKey}/{itemId}/
 * {draft|published}.{ext}, but this walks whatever depth actually exists
 * rather than assuming that specific shape stays fixed forever) requires
 * following every such pseudo-entry, not just reading one list() call.
 *
 * Runs through the CALLER's own RLS-scoped session client, never the
 * admin/service-role client - the same reasoning copyDraftToPublished
 * (media/publish.ts) already documents for this bucket: the "tenant
 * members can read/delete their own media" policies (0006) already
 * restrict every list()/remove() call to paths whose first segment is a
 * tenant this caller actually belongs to. A caller passed a tenantId it
 * is not a member of gets back nothing here, by RLS itself, not by any
 * check written in this file.
 */
async function listAllTenantMediaPaths(supabase: SupabaseClient, prefix: string): Promise<string[]> {
  const paths: string[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.storage.from(MEDIA_BUCKET).list(prefix, {
      limit: pageSize,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) {
      throw new TenantMediaCleanupError(`Could not list Space media at "${prefix}": ${error.message}`);
    }
    for (const entry of data ?? []) {
      const fullPath = `${prefix}/${entry.name}`;
      if (entry.id === null) {
        paths.push(...(await listAllTenantMediaPaths(supabase, fullPath)));
      } else {
        paths.push(fullPath);
      }
    }
    if ((data?.length ?? 0) < pageSize) break;
  }
  return paths;
}

/**
 * Removes every Storage object belonging to one tenant - Task 017 (Space
 * Storage Cleanup), fixing the gap the TASK 016 Privacy/Vendor Facts
 * Audit identified: delete_space() (0018_space_delete.sql) only ever
 * removed database rows, never the tenant's uploaded files, leaving them
 * orphaned in the (public via signed-URL-only delivery, never publicly
 * listable) tenant-media bucket.
 *
 * Deliberately the FIRST step of deleteSpaceCompletely and of
 * replaceSpace (lifecycleActions.ts), before their database step runs -
 * see removeSpaceMediaAsOwner's own comment for why that ordering is what
 * makes a partial failure safe rather than catastrophic. It removes every
 * object under the tenant folder regardless of whether the database still
 * references it (drafts, published copies, superseded uploads, orphans).
 */
export async function removeAllTenantMedia(supabase: SupabaseClient, tenantId: string): Promise<void> {
  // Fail closed on anything that is not exactly one tenant folder name: an
  // empty, traversal-shaped or multi-segment value must never become a
  // listing prefix (an empty prefix would enumerate the whole bucket).
  if (!isTenantId(tenantId)) {
    throw new TenantMediaCleanupError("Refusing to remove media for a malformed tenant id");
  }
  const paths = await listAllTenantMediaPaths(supabase, tenantId);
  if (paths.length === 0) return;

  // Chunked defensively - remove() accepts many paths in one call, but
  // there is no documented unlimited ceiling worth relying on for a
  // Space that has accumulated a very large media library over time.
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100);
    const { data, error } = await supabase.storage.from(MEDIA_BUCKET).remove(chunk);
    if (error) {
      throw new TenantMediaCleanupError(`Could not remove Space media: ${error.message}`);
    }
    // Storage reports RLS-denied or vanished objects as "not removed" with
    // no error; a short result must never be mistaken for a full cleanup.
    if (data && data.length < chunk.length) {
      throw new TenantMediaCleanupError("Could not remove all Space media");
    }
  }
}
