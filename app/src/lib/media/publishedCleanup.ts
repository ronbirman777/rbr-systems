import type { SupabaseClient } from "@supabase/supabase-js";
import { MEDIA_BUCKET, isPublishedMediaPath } from "./path";

/** Thrown by the post-publish sweep. The caller logs it and moves on - it
 * must never fail or roll back a Publish that already committed. */
export class PublishedMediaCleanupError extends Error {}

/** Orphan published copies younger than this are left alone: they may
 * belong to a Publish that is still in flight (copied, RPC not yet
 * committed), and deleting them would break that Publish. */
export const ORPHAN_GRACE_MS = 10 * 60 * 1000;

type StoredObject = { path: string; updatedAt: number };

async function listObjects(supabase: SupabaseClient, prefix: string): Promise<StoredObject[]> {
  const out: StoredObject[] = [];
  const pageSize = 1000;
  const folders: string[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.storage.from(MEDIA_BUCKET).list(prefix, {
      limit: pageSize,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new PublishedMediaCleanupError(`Could not list media at "${prefix}": ${error.message}`);
    for (const entry of data ?? []) {
      const fullPath = `${prefix}/${entry.name}`;
      if (entry.id === null) {
        folders.push(fullPath);
      } else {
        const stamp = Date.parse(entry.updated_at ?? entry.created_at ?? "");
        out.push({ path: fullPath, updatedAt: Number.isNaN(stamp) ? Date.now() : stamp });
      }
    }
    if ((data?.length ?? 0) < pageSize) break;
  }
  const nested = await Promise.all(folders.map((folder) => listObjects(supabase, folder)));
  return out.concat(...nested);
}

/**
 * Post-publish sweep - runs ONLY after publish_space() has committed the
 * new snapshot, with `currentRefs` read back from that committed snapshot
 * (the source of truth, the same set /api/media authorizes against).
 * Removes:
 *  1. every published object the PREVIOUS snapshot referenced that the
 *     new one does not (`previousRefs - currentRefs`), immediately; and
 *  2. any other `published.*` object under the tenant that the snapshot
 *     does not reference and that is older than the grace period - this
 *     is what makes a failed earlier sweep, or a Publish that copied but
 *     never committed, retryable: the next successful Publish reclaims it.
 * Never touches `draft.*` objects and never removes anything in
 * `currentRefs`. A failure leaves orphans behind, never a broken
 * snapshot; running it again is always safe (removal is idempotent).
 */
export async function cleanupStalePublishedMedia(
  supabase: SupabaseClient,
  tenantId: string,
  previousRefs: Iterable<string>,
  currentRefs: ReadonlySet<string>,
  options: { now?: number; graceMs?: number } = {}
): Promise<{ removed: string[] }> {
  const now = options.now ?? Date.now();
  const graceMs = options.graceMs ?? ORPHAN_GRACE_MS;
  const prefix = `${tenantId}/`;

  const removed: string[] = [];
  const errors: string[] = [];
  const removePaths = async (paths: string[]) => {
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100);
      const { error } = await supabase.storage.from(MEDIA_BUCKET).remove(chunk);
      if (error) errors.push(error.message);
      else removed.push(...chunk);
    }
  };

  const previousStale = new Set<string>();
  for (const ref of previousRefs) {
    if (!currentRefs.has(ref) && ref.startsWith(prefix) && isPublishedMediaPath(ref)) previousStale.add(ref);
  }
  await removePaths([...previousStale]);

  try {
    const objects = await listObjects(supabase, tenantId);
    const orphans = objects
      .filter((o) => isPublishedMediaPath(o.path) && !currentRefs.has(o.path) && !previousStale.has(o.path))
      .filter((o) => now - o.updatedAt >= graceMs)
      .map((o) => o.path);
    await removePaths(orphans);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "listing failed");
  }

  if (errors.length > 0) {
    throw new PublishedMediaCleanupError(`Could not remove stale published media: ${errors[0]}`);
  }
  return { removed };
}
