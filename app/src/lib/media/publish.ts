import type { SupabaseClient } from "@supabase/supabase-js";
import { MEDIA_BUCKET, OPTIMIZED_IMAGE_MIME, publishedMediaPath } from "./path";

/**
 * Thrown whenever a Storage operation this module performs fails - the
 * caller (publishSpace() in configurator/retreat/actions.ts) must catch
 * this and refuse to call the publish_space() RPC, so a failed media
 * publish can never produce a "successful" Publish. Never swallowed
 * internally.
 */
export class MediaPublishError extends Error {}

/**
 * Copies one draft photo to its published counterpart - the only place a
 * draft becomes published media, shared by every image-bearing thing
 * (module items, module covers, brand Hero/Space/Logo).
 *
 * This function only ever CREATES a published object. It never lists or
 * deletes anything: removing published media is the post-publish sweep's
 * job (publishedCleanup.ts), and only once the new snapshot is committed.
 * That is what keeps the currently-live snapshot intact if any step of a
 * Publish fails - nothing the live snapshot references is touched before
 * publish_space() commits.
 *
 * Every upload has its own uploadId folder (see path.ts), so
 * `.../{uploadId}/published.webp` is written from bytes that never change
 * afterwards: re-running this for the same draft (a retry after a failed
 * publish, or a republish with an unchanged photo) rewrites identical
 * bytes and is safe. A different photo always lands at a different key,
 * so the live snapshot's object is never overwritten with different
 * content. (Legacy drafts without an uploadId folder still map to a
 * single stable published key and are overwritten in place, exactly as
 * before - documented as TASK 027 legacy scope, not migrated here.)
 *
 * IMPORTANT - download+upload(upsert), not storage `copy`: `copy` errors
 * with 409 KeyAlreadyExists whenever the destination exists (confirmed
 * against Production), which breaks the legacy/retry case.
 * `{ cache: "no-store" }` on the download is required so a Next.js server
 * runtime never re-uploads a cached response body for the draft.
 *
 * Returns the published path that was written (null when there is no
 * draft photo, i.e. nothing to copy).
 */
export async function copyDraftToPublished(supabase: SupabaseClient, draftPath: string | null): Promise<string | null> {
  if (!draftPath) return null;
  const publishedPath = publishedMediaPath(draftPath);
  // Not a draft-shaped path: publish_space() leaves such a ref untransformed
  // as well, so there is nothing to copy.
  if (!publishedPath) return null;

  const { data: draftBlob, error: downloadError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .download(draftPath, {}, { cache: "no-store" });
  if (downloadError || !draftBlob) {
    throw new MediaPublishError(
      `Could not read the draft image at "${draftPath}": ${downloadError?.message ?? "no data returned"}`
    );
  }

  const { error: uploadError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(publishedPath, draftBlob, { upsert: true, contentType: OPTIMIZED_IMAGE_MIME });
  if (uploadError) {
    throw new MediaPublishError(`Could not publish the image to "${publishedPath}": ${uploadError.message}`);
  }
  return publishedPath;
}
