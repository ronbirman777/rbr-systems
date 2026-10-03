import type { SupabaseClient } from "@supabase/supabase-js";
import { AUDIO_MIME_BY_EXTENSION } from "./audio";
import { MEDIA_BUCKET, OPTIMIZED_IMAGE_MIME, isVersionedMediaPath, parseVersionedMediaPath, publishedMediaPath } from "./path";

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
 * (module items, module covers, brand Hero/Space/Logo, Teach images).
 *
 * This function only ever CREATES a published object. It never lists or
 * deletes anything: removing published media is the post-publish sweep's
 * job (publishedCleanup.ts), and only once the new snapshot is committed.
 * That is what keeps the currently-live snapshot intact if any step of a
 * Publish fails - nothing the live snapshot references is touched before
 * publish_space() commits.
 *
 * VERSIONED drafts (`{tenant}/{module}/{item}/{uploadId}/draft.<ext>`,
 * see isVersionedMediaPath) are published create-only and immutable,
 * exactly like audio: the destination is the `published.<ext>` sibling in
 * the SAME uploadId folder, made with Storage's server-side `copy` (which
 * keeps the content type and refuses to overwrite). A retry where the
 * destination already exists is idempotent success when it is
 * byte-identical to the draft and a MediaPublishError otherwise. No
 * versioned object is ever written with upsert, so normal operation needs
 * no Storage UPDATE on versioned media.
 *
 * LEGACY drafts (no uploadId folder, `{tenant}/{module}/{item}/draft.<ext>`)
 * still map to one stable published key that is overwritten in place with
 * download+upload(upsert) - documented as TASK 027 legacy scope, the only
 * remaining path that needs Storage UPDATE. `{ cache: "no-store" }` on its
 * download is required so a Next.js server runtime never re-uploads a
 * cached response body for the draft.
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

  if (isVersionedMediaPath(draftPath)) {
    await copyImmutableObject(supabase, draftPath, publishedPath);
    return publishedPath;
  }

  // Legacy stable-path overwrite (not a versioned object).
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

type StorageErrorLike = { message?: string; status?: number | string; statusCode?: number | string } | null | undefined;

function isAlreadyExists(error: StorageErrorLike): boolean {
  if (!error) return false;
  return (
    String(error.statusCode ?? error.status ?? "") === "409" ||
    /already exists|duplicate|resource already/i.test(error.message ?? "")
  );
}

async function sameBytes(supabase: SupabaseClient, a: string, b: string): Promise<boolean> {
  const bucket = supabase.storage.from(MEDIA_BUCKET);
  const [first, second] = await Promise.all([
    bucket.download(a, {}, { cache: "no-store" }),
    bucket.download(b, {}, { cache: "no-store" }),
  ]);
  if (first.error || !first.data || second.error || !second.data) {
    throw new MediaPublishError(`Could not compare "${a}" with "${b}".`);
  }
  if (first.data.size !== second.data.size) return false;
  const [x, y] = await Promise.all([first.data.arrayBuffer(), second.data.arrayBuffer()]);
  return Buffer.from(x).equals(Buffer.from(y));
}

/**
 * Whether two existing objects hold the same bytes. Size and ETag from
 * Storage metadata settle the common cases without downloading anything;
 * only a same-size/ETag-unknown pair falls back to a byte comparison.
 */
async function objectsIdentical(supabase: SupabaseClient, a: string, b: string): Promise<boolean> {
  const bucket = supabase.storage.from(MEDIA_BUCKET);
  const [infoA, infoB] = await Promise.all([bucket.info(a), bucket.info(b)]);
  const metaA = infoA.data;
  const metaB = infoB.data;
  if (!infoA.error && !infoB.error && metaA && metaB) {
    if (typeof metaA.size === "number" && typeof metaB.size === "number" && metaA.size !== metaB.size) return false;
    if (metaA.etag && metaB.etag && metaA.etag === metaB.etag) return true;
  }
  return sameBytes(supabase, a, b);
}

/**
 * Create-only copy for an immutable versioned object: `source` -> `dest`,
 * never overwriting. If `dest` already exists it is a retry (identical
 * bytes -> success, nothing written) or a collision (different bytes ->
 * MediaPublishError, nothing written). Uses Storage's server-side `copy`,
 * so the file is never buffered in this process in the normal path, and
 * the source's content type and metadata are carried over unchanged.
 */
async function copyImmutableObject(supabase: SupabaseClient, source: string, dest: string): Promise<void> {
  const { error } = await supabase.storage.from(MEDIA_BUCKET).copy(source, dest);
  if (!error) return;
  if (!isAlreadyExists(error)) {
    throw new MediaPublishError(`Could not publish "${source}" to "${dest}": ${error.message}`);
  }
  if (!(await objectsIdentical(supabase, source, dest))) {
    throw new MediaPublishError(
      `A different file already exists at "${dest}"; refusing to overwrite published media.`
    );
  }
}

/**
 * Audio counterpart of copyDraftToPublished. The source is an explicit
 * versioned draft ref (`{tenant}/{module}/{item}/{uploadId}/draft.<ext>`);
 * the destination is derived from the same uploadId folder, so a draft and
 * its published copy always share one uploadId. Published audio is
 * immutable: an existing destination is accepted only when it is
 * byte-identical (idempotent retry), otherwise this fails. Unlike images
 * there is no legacy/unversioned fallback - a malformed or unversioned
 * ref throws rather than silently copying nothing.
 *
 * Returns the published path (null when there is no draft audio).
 */
export async function copyDraftAudioToPublished(
  supabase: SupabaseClient,
  draftPath: string | null
): Promise<string | null> {
  if (!draftPath) return null;
  const parts = parseVersionedMediaPath(draftPath);
  if (!parts || parts.kind !== "draft" || !AUDIO_MIME_BY_EXTENSION[parts.ext]) {
    throw new MediaPublishError(`"${draftPath}" is not a versioned draft audio ref.`);
  }
  const publishedPath = publishedMediaPath(draftPath);
  if (!publishedPath) throw new MediaPublishError(`"${draftPath}" is not a draft ref.`);
  await copyImmutableObject(supabase, draftPath, publishedPath);
  return publishedPath;
}
