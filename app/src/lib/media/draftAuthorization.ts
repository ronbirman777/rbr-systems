import type { SupabaseClient } from "@supabase/supabase-js";
import { parseAudioDraftRef } from "./audio";

/**
 * True only when `path` is a versioned DRAFT audio object that the CURRENT
 * draft data of `tenantId` points at, exactly. Existence in Storage and
 * living under the tenant folder are never enough: a previous (replaced)
 * draft version, an uploaded-but-never-attached object, a published
 * sibling, another tenant's path or any malformed path all return false.
 *
 * `supabase` must be the caller's own RLS-scoped session client, so a
 * non-member sees no row at all (membership is enforced by the database,
 * not by this function). Any lookup error is a denial.
 */
export async function isReferencedDraftAudio(supabase: SupabaseClient, tenantId: string, path: string): Promise<boolean> {
  const parts = parseAudioDraftRef(path);
  if (!parts || parts.tenantId !== tenantId) return false;
  const { data, error } = await supabase
    .from("module_items")
    .select("metadata")
    .eq("tenant_id", tenantId)
    .eq("id", parts.itemId)
    .maybeSingle();
  if (error || !data) return false;
  const ref = (data.metadata as Record<string, unknown> | null)?.audioRef;
  return typeof ref === "string" && ref === path;
}
