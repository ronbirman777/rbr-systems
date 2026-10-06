import type { SupabaseClient } from "@supabase/supabase-js";
import { MEDIA_BUCKET } from "./path";

/**
 * Browser -> Storage upload of one audio draft, through the member's own
 * session. `upsert: false` is the point: every upload has a brand-new
 * versioned path (minted server-side - see prepareTeachAudioUpload and
 * its Flow counterpart), so an existing object is never replaced - a
 * collision is an error, not an overwrite.
 *
 * Product-neutral, like its sibling lib/media/audio.ts: nothing here
 * knows which product's item the bytes belong to, only that the path it
 * was handed is the one the server authorized.
 */
export async function uploadAudioDraftObject(
  supabase: SupabaseClient,
  path: string,
  file: Blob & { type: string }
): Promise<{ error: string | null }> {
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, { upsert: false, contentType: file.type });
  return { error: error?.message ?? null };
}

/**
 * The track's length in seconds, read from the file in the browser before
 * it is uploaded, or null if the browser cannot tell.
 *
 * Null is a normal outcome, not a failure: a format the <audio> element
 * will not decode, or a stream with no duration in its header, simply
 * means the guest app shows no duration. The upload still proceeds - a
 * missing duration is cosmetic, and refusing the file over it would be
 * worse than showing one track without a time.
 *
 * The object URL is revoked on both paths; `done` exists so that neither
 * the success nor the error handler can leak it.
 */
export function detectAudioDuration(file: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = (v: number | null) => {
      URL.revokeObjectURL(url);
      resolve(v);
    };
    audio.preload = "metadata";
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? Math.round(audio.duration) : null);
    audio.onerror = () => done(null);
    audio.src = url;
  });
}
