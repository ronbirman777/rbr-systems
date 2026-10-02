import type { SupabaseClient } from "@supabase/supabase-js";
import { MEDIA_BUCKET, isDraftMediaPathForTenant } from "./path";

/**
 * Removes exactly the named DRAFT objects for one tenant - nothing else.
 * Refs that are not tenant-owned `draft.*` paths (published objects,
 * another tenant's files, malformed paths) are skipped, so a bug or a
 * crafted ref can never delete published media or recurse into a folder.
 * Best-effort: a failed removal only leaves an unreferenced draft behind,
 * which is harmless; it never throws and never affects the DB state the
 * caller already committed. Returns the refs that were requested for
 * removal (after the safety filter).
 */
export async function removeDraftObjects(
  supabase: SupabaseClient,
  tenantId: string,
  refs: Array<string | null | undefined>
): Promise<string[]> {
  const targets = [...new Set(refs.filter((r): r is string => typeof r === "string" && isDraftMediaPathForTenant(tenantId, r)))];
  if (targets.length === 0) return [];
  const { error } = await supabase.storage.from(MEDIA_BUCKET).remove(targets);
  if (error) console.error("removeDraftObjects: could not remove draft objects", error.message);
  return targets;
}
