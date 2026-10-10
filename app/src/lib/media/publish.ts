import type { SupabaseClient } from "@supabase/supabase-js";
import { AUDIO_MIME_BY_EXTENSION } from "./audio";
import { isCanonicalStoredImage } from "./imageSignature";
import { sameFingerprint, sha256Hex, type ContentFingerprint } from "./fingerprint";
import {
  MAX_IMAGE_BYTES,
  MEDIA_BUCKET,
  OPTIMIZED_IMAGE_EXTENSION,
  OPTIMIZED_IMAGE_MIME,
  isDraftMediaPathForTenant,
  isVersionedMediaPath,
  parseVersionedMediaPath,
  publishedMediaPath,
} from "./path";

/**
 * Thrown whenever a Storage operation this module performs fails - the
 * caller (publishSpace() in configurator/retreat/actions.ts) must catch
 * this and refuse to call the publish_space() RPC, so a failed media
 * publish can never produce a "successful" Publish. Never swallowed
 * internally.
 */
export class MediaPublishError extends Error {}

/**
 * TASK 032 (0045). Set when the copy runs on the TRUSTED (service-role)
 * client for a billing-governed Space - see lib/media/trustedMedia.server.ts.
 * The service role bypasses Storage RLS, so the tenant check RLS used to make
 * is made here instead (the draft must be this tenant's own object), and a
 * newly created published IMAGE is validated from its stored bytes
 * (isCanonicalStoredImage) before it may stand: if it is not a canonical
 * WebP the published copy and its draft are deleted and the publish fails.
 * This is the step that keeps a publish from laundering bytes into a
 * guest-servable `published.*` path.
 */
export type PublishCopyOptions = {
  trustedTenantId?: string;
  /**
   * TASK 032 (0046), audio on the trusted path only: the size + sha256 the
   * server recorded when it measured this draft (billing_audio_verifications).
   * Required there - a missing fingerprint means the file was never measured
   * by the server and is refused.
   */
  audioFingerprint?: PublishAudioFingerprint | null;
  /**
   * Trusted path: called after the published copy was hashed and found equal
   * to `audioFingerprint`, with the Storage ETag it had when read, so the next
   * publish can skip re-hashing an unchanged copy (recordPublishedAudioFingerprint).
   * Errors are ignored - the only effect is a re-hash next time.
   */
  onAudioPublishedVerified?: (draftRef: string, etag: string) => void | Promise<void>;
};

/**
 * The measured fingerprint, plus - when an earlier publish already hashed the
 * published copy and found it equal - that copy's Storage ETag and size.
 */
export type PublishAudioFingerprint = ContentFingerprint & { published?: { sizeBytes: number; etag: string } | null };

/**
 * TASK 032 (0046): at most this many audio publish copies (each may download
 * and hash a file of up to MAX_AUDIO_BYTES) run at once in this server
 * process, however many items or concurrent publishes there are.
 */
export const AUDIO_PUBLISH_CONCURRENCY = 2;
let audioSlotsInUse = 0;
const audioSlotWaiters: (() => void)[] = [];
async function withAudioSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (audioSlotsInUse < AUDIO_PUBLISH_CONCURRENCY) audioSlotsInUse += 1;
  else await new Promise<void>((resolve) => audioSlotWaiters.push(resolve)); // the slot is handed over, count unchanged
  try {
    return await fn();
  } finally {
    const next = audioSlotWaiters.shift();
    if (next) next();
    else audioSlotsInUse -= 1;
  }
}

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
export async function copyDraftToPublished(
  supabase: SupabaseClient,
  draftPath: string | null,
  options: PublishCopyOptions = {}
): Promise<string | null> {
  if (!draftPath) return null;
  const publishedPath = publishedMediaPath(draftPath);
  // Not a draft-shaped path: publish_space() leaves such a ref untransformed
  // as well, so there is nothing to copy.
  if (!publishedPath) return null;
  const trustedTenantId = options.trustedTenantId;
  if (trustedTenantId !== undefined) {
    // Every image the trusted pipeline stores is `draft.webp` in this
    // tenant's own folder; anything else is not copied by the service role.
    if (!isDraftMediaPathForTenant(trustedTenantId, draftPath) || !draftPath.endsWith(`/draft.${OPTIMIZED_IMAGE_EXTENSION}`)) {
      throw new MediaPublishError(`"${draftPath}" is not an image this Space's Studio stored; upload it again.`);
    }
  }

  if (isVersionedMediaPath(draftPath)) {
    const created = await copyImmutableObject(supabase, draftPath, publishedPath);
    if (created && trustedTenantId !== undefined) await assertPublishedImage(supabase, draftPath, publishedPath);
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
  if (trustedTenantId !== undefined) {
    const ok = draftBlob.size <= MAX_IMAGE_BYTES && isCanonicalStoredImage(new Uint8Array(await draftBlob.arrayBuffer()));
    if (!ok) {
      await supabase.storage.from(MEDIA_BUCKET).remove([draftPath]);
      throw new MediaPublishError(`"${draftPath}" is not a valid image; upload it again.`);
    }
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
async function copyImmutableObject(supabase: SupabaseClient, source: string, dest: string): Promise<boolean> {
  const { error } = await supabase.storage.from(MEDIA_BUCKET).copy(source, dest);
  if (!error) return true;
  if (!isAlreadyExists(error)) {
    throw new MediaPublishError(`Could not publish "${source}" to "${dest}": ${error.message}`);
  }
  if (!(await objectsIdentical(supabase, source, dest))) {
    throw new MediaPublishError(
      `A different file already exists at "${dest}"; refusing to overwrite published media.`
    );
  }
  return false;
}

/**
 * Trusted path only: reads back the published object just created and
 * requires a canonical WebP (lib/media/imageSignature.ts). On failure both
 * the published copy and its draft are removed (neither is referenced by a
 * committed snapshot yet - the RPC has not run) and the publish fails.
 */
async function assertPublishedImage(supabase: SupabaseClient, draftPath: string, publishedPath: string): Promise<void> {
  const bucket = supabase.storage.from(MEDIA_BUCKET);
  const { data, error } = await bucket.download(publishedPath, {}, { cache: "no-store" });
  const ok =
    !error && !!data && data.size <= MAX_IMAGE_BYTES && isCanonicalStoredImage(new Uint8Array(await data.arrayBuffer()));
  if (ok) return;
  await bucket.remove([publishedPath, draftPath]);
  throw new MediaPublishError(`"${draftPath}" is not a valid image; upload it again.`);
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
 * TASK 032 (0046), trusted (paid Space) path: the published copy - newly
 * made or already there - is re-read and its size + sha256 must equal the
 * fingerprint the server recorded when it measured the draft. This closes
 * the swap window between measurement and publish (a member may delete its
 * draft and upload different bytes at the same path): a mismatch removes a
 * copy made by THIS call (never one that already existed - the live snapshot
 * may reference it) and refuses the publish; the owner uploads the file again.
 * An EXISTING published copy whose Storage ETag and size equal the ones
 * recorded when an earlier publish hashed it is not downloaded again; any
 * other ETag/size (or none) is re-hashed. At most AUDIO_PUBLISH_CONCURRENCY
 * audio copies run at once.
 *
 * Returns the published path (null when there is no draft audio).
 */
export async function copyDraftAudioToPublished(
  supabase: SupabaseClient,
  draftPath: string | null,
  options: PublishCopyOptions = {}
): Promise<string | null> {
  if (!draftPath) return null;
  const parts = parseVersionedMediaPath(draftPath);
  if (!parts || parts.kind !== "draft" || !AUDIO_MIME_BY_EXTENSION[parts.ext]) {
    throw new MediaPublishError(`"${draftPath}" is not a versioned draft audio ref.`);
  }
  const trusted = options.trustedTenantId !== undefined;
  // Trusted (service-role) copy: the tenant check Storage RLS used to make.
  if (trusted && parts.tenantId !== options.trustedTenantId) {
    throw new MediaPublishError(`"${draftPath}" does not belong to this Space.`);
  }
  const expected = options.audioFingerprint ?? null;
  if (trusted && !expected) {
    throw new MediaPublishError(`The recording at "${draftPath}" has not been verified by the server; upload it again.`);
  }
  const publishedPath = publishedMediaPath(draftPath);
  if (!publishedPath) throw new MediaPublishError(`"${draftPath}" is not a draft ref.`);
  return withAudioSlot(async () => {
    const created = await copyImmutableObject(supabase, draftPath, publishedPath);
    if (trusted && expected) {
      await assertPublishedAudioFingerprint(supabase, draftPath, publishedPath, expected, created, options.onAudioPublishedVerified);
    }
    return publishedPath;
  });
}

/** Size + sha256 of a stored object, read with `{ cache: "no-store" }`. */
export async function fingerprintStoredObject(supabase: SupabaseClient, path: string): Promise<ContentFingerprint> {
  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).download(path, {}, { cache: "no-store" });
  if (error || !data) {
    throw new MediaPublishError(`Could not read "${path}" to verify it: ${error?.message ?? "no data returned"}`);
  }
  const bytes = new Uint8Array(await data.arrayBuffer());
  return { sizeBytes: bytes.byteLength, sha256: sha256Hex(bytes) };
}

async function assertPublishedAudioFingerprint(
  supabase: SupabaseClient,
  draftPath: string,
  publishedPath: string,
  expected: PublishAudioFingerprint,
  created: boolean,
  onVerified: PublishCopyOptions["onAudioPublishedVerified"]
): Promise<void> {
  // ETag/size read BEFORE hashing: if the object changed in between, the
  // recorded ETag is the OLD one and the next publish re-hashes (never the
  // other way round).
  const { data: info, error: infoError } = await supabase.storage.from(MEDIA_BUCKET).info(publishedPath);
  const etag = !infoError && info && typeof info.etag === "string" && info.etag ? info.etag : null;
  const size = !infoError && info && typeof info.size === "number" ? info.size : null;
  const known = expected.published ?? null;
  if (!created && known && etag !== null && etag === known.etag && size === known.sizeBytes && size === expected.sizeBytes) {
    return; // the same published object an earlier publish hashed and found equal
  }
  const actual = await fingerprintStoredObject(supabase, publishedPath);
  if (sameFingerprint(actual, expected)) {
    if (etag !== null && onVerified) {
      try {
        await onVerified(draftPath, etag);
      } catch {
        // best-effort: the next publish re-hashes
      }
    }
    return;
  }
  if (created) await supabase.storage.from(MEDIA_BUCKET).remove([publishedPath]);
  throw new MediaPublishError(
    `The recording at "${publishedPath}" is not the file that was measured when it was uploaded; upload it again.`
  );
}
