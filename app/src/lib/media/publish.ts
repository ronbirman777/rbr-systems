import type { SupabaseClient } from "@supabase/supabase-js";
import { MEDIA_BUCKET, OPTIMIZED_IMAGE_MIME, publishedMediaPath, mediaItemFolder } from "./path";

/**
 * Thrown whenever any Storage operation this module performs fails - the
 * caller (publishSpace() in configurator/retreat/actions.ts) must catch
 * this and refuse to call the publish_space() RPC, so a failed media
 * publish can never produce a "successful" Publish with stale images
 * still live. Never swallowed internally.
 */
export class MediaPublishError extends Error {}

/**
 * The one place a draft photo becomes its published counterpart - shared
 * by every image-bearing thing in the product: module_items rows
 * (facilitators/meals/treatments/facilities/customPages) and brand-level
 * refs (Today Hero, Space Image, Logo).
 *
 * Runs through the caller's own RLS-enforcing client, never the admin
 * client - every operation here only succeeds because both the source and
 * destination paths start with this tenant's own id (see the tenant-media
 * bucket RLS policies, 0006_schedule_screen_and_storage.sql).
 *
 * IMPORTANT - why this is download+upload(upsert), not storage `copy`:
 * Storage's `copy(from, to)` errors with 409 "KeyAlreadyExists" the
 * moment `to` already exists - which is exactly the Republish case (the
 * very first Publish always works, since nothing exists yet at the
 * published path; every Republish after that silently failed to update
 * the image while publish_space() still reported success). Confirmed
 * directly against Production: a 409 from the copy endpoint, an
 * unchanged Storage object etag after Republish, and a byte-for-byte
 * (MD5) mismatch between what was served to guests and what the draft
 * actually contained.
 *
 * `upload(path, body, { upsert: true })` IS an atomic single-object
 * replace on this backend (the same primitive every draft photo upload
 * already relies on to let an organizer replace a draft repeatedly) -
 * unlike `copy`, it succeeds whether or not something already exists at
 * that path, and there is no intermediate "object missing" state a
 * concurrent guest request could observe mid-write. That is the
 * "atomic overwrite" the Storage API actually offers; there is no
 * atomic *copy*-and-replace primitive, so this function downloads the
 * draft's current bytes and re-uploads them to the published path
 * instead of asking Storage to copy in place.
 *
 * Ordering is deliberate: the new published object is written FIRST;
 * only once that succeeds do we clean up a stale, differently-named
 * published.* sibling (e.g. the organizer replaced a .jpg draft with a
 * .png one, so the old published.jpg is now orphaned). This means the
 * currently-live published object - whatever its extension - is never
 * removed until its replacement already exists. The one honest remaining
 * risk: if that final best-effort cleanup step itself fails, a stale
 * old-extension file can linger in Storage - a harmless orphan (nothing
 * in the published snapshot ever points at it, since the snapshot always
 * names the current extension), not a guest-visible correctness issue.
 * There is no way to make a delete+write span two Storage keys as one
 * atomic transaction with the APIs available here, so this is the
 * safest ordering achievable, not a claim of full atomicity across both
 * steps.
 */
export async function copyDraftToPublished(
  supabase: SupabaseClient,
  draftPath: string | null,
  fallbackFolder: string
): Promise<void> {
  const publishedPath = draftPath ? publishedMediaPath(draftPath) : null;
  const folder = draftPath ? mediaItemFolder(draftPath) : fallbackFolder;
  if (!folder) return;

  if (draftPath && publishedPath) {
    // { cache: "no-store" } is required here, not optional - confirmed
    // against Production (see PRODUCTION QA note below): supabase-js's
    // download() issues a plain GET with no cache directive of its own, so
    // inside this Next.js server runtime it inherits whatever the
    // ambient fetch() patch does. Without this, a Republish could
    // silently re-upload an OLD cached response body for the draft
    // instead of throwing - the published object's row would still get a
    // fresh updated_at/lastModified (because the upload itself succeeds),
    // making it look like a successful, no-op republish with zero errors
    // anywhere. This is exactly the documented fix for this situation
    // (storage-js's own JSDoc calls this out for Edge Functions - the same
    // fetch-caching class of environment as a Next.js Server Action).
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
  }

  // Stale-sibling cleanup - runs only after the current publish target
  // (if any) has already succeeded above, so it can never remove the
  // one published object a guest should currently be seeing. When
  // draftPath is null (the photo was removed entirely), publishedPath is
  // also null, so every published.* file for this item is correctly
  // treated as stale and removed.
  const { data: siblings, error: listError } = await supabase.storage.from(MEDIA_BUCKET).list(folder);
  if (listError) {
    throw new MediaPublishError(`Could not list media for "${folder}": ${listError.message}`);
  }

  const stalePublished = (siblings ?? [])
    .filter((f) => f.name.startsWith("published.") && `${folder}/${f.name}` !== publishedPath)
    .map((f) => `${folder}/${f.name}`);
  if (stalePublished.length > 0) {
    const { error: removeError } = await supabase.storage.from(MEDIA_BUCKET).remove(stalePublished);
    if (removeError) {
      throw new MediaPublishError(`Could not remove stale published media for "${folder}": ${removeError.message}`);
    }
  }
}
