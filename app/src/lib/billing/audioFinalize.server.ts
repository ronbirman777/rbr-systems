import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { MEDIA_BUCKET } from "@/lib/media/path";
import { MAX_AUDIO_BYTES } from "@/lib/media/audio";
import { deriveAudioDuration, toWholeSeconds } from "@/lib/media/audioDuration";

/**
 * The service-role half of the audio finalize path for billing-governed
 * (paid, non-exempt) Spaces (TASK B4b). Called ONLY by attachTeachAudio /
 * attachFlowAudio after they have verified the signed-in user's access to
 * the tenant, the draft ref's shape (tenant/module/item) and the stored
 * object's size and content type.
 *
 * Why service role: from 0043 on, the database refuses any authenticated
 * (member) write that sets or changes module_items.metadata.audioRef /
 * durationSeconds on such a Space (trigger billing_guard_module_item_audio),
 * so the only way a file can be attached is this path, which first measures
 * the stored bytes itself. The database re-checks the per-recording and
 * library limits on this write too.
 *
 * Legacy (no billing row) and exempt Spaces never come here: they keep the
 * member-session write and the browser-reported duration, unchanged.
 */

/**
 * Downloads the stored object and measures it (lib/media/audioDuration).
 * Whole seconds, or null when the length cannot be determined - the caller
 * refuses the upload (fail closed).
 */
export async function deriveStoredAudioSeconds(ref: string, ext: string): Promise<number | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.storage.from(MEDIA_BUCKET).download(ref, {}, { cache: "no-store" });
    if (error || !data || data.size > MAX_AUDIO_BYTES) return null;
    const result = deriveAudioDuration(new Uint8Array(await data.arrayBuffer()), ext);
    return result.ok ? toWholeSeconds(result.seconds) : null;
  } catch {
    return null;
  }
}

export type EnforcedAudioWrite = { ok: true } | { ok: false; reason: "studioLocked" | "limit" | "failed" };

/**
 * Writes the verified file fields onto the item. Service role bypasses RLS,
 * so the billing Studio-write rule (0039's restrictive policies) is re-checked
 * here explicitly first: a Studio-suspended Space cannot attach through this
 * path either. Scoped by tenant AND item id.
 */
export async function writeEnforcedAudioFile(
  tenantId: string,
  itemId: string,
  metadata: Record<string, unknown>
): Promise<EnforcedAudioWrite> {
  try {
    const admin = createAdminClient();
    const { data: writable, error: writableError } = await admin.rpc("space_studio_writable", { p_tenant_id: tenantId });
    if (writableError) return { ok: false, reason: "failed" };
    if (writable !== true) return { ok: false, reason: "studioLocked" };
    const { data, error } = await admin
      .from("module_items")
      .update({ metadata })
      .eq("tenant_id", tenantId)
      .eq("id", itemId)
      .select("id");
    if (error) return { ok: false, reason: error.hint === "AUDIO_LIMIT" ? "limit" : "failed" };
    return (data ?? []).length === 1 ? { ok: true } : { ok: false, reason: "failed" };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
