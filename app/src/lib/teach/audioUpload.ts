import type { SupabaseClient } from "@supabase/supabase-js";
import { MEDIA_BUCKET } from "@/lib/media/path";

/**
 * Browser -> Storage upload of one audio draft, through the member's own
 * session. `upsert: false` is the point: every upload has a brand-new
 * versioned path (see prepareTeachAudioUpload), so an existing object is
 * never replaced - a collision is an error, not an overwrite.
 */
export async function uploadAudioDraftObject(
  supabase: SupabaseClient,
  path: string,
  file: Blob & { type: string }
): Promise<{ error: string | null }> {
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, { upsert: false, contentType: file.type });
  return { error: error?.message ?? null };
}
