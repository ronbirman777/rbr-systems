import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { MEDIA_BUCKET } from "@/lib/media/path";
import { MAX_AUDIO_BYTES } from "@/lib/media/audio";
import { deriveAudioDuration, toWholeSeconds } from "@/lib/media/audioDuration";
import { sha256Hex } from "@/lib/media/fingerprint";

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
 *
 * TASK 032 (0046): the measurement is now also recorded as server
 * provenance (billing_audio_verifications) with a content fingerprint, and
 * the database refuses to publish an enforced Space's audio without it.
 */

/**
 * TASK 032 (0046) - the content fingerprint of a stored object: its size and
 * the sha256 of its bytes, computed server-side. Recorded with the measured
 * length (billing_audio_verifications) and compared again at publish against
 * the published copy (lib/media/publish.ts), so bytes swapped after the
 * measurement can never be published under the measured length.
 */
export type AudioFingerprint = { sizeBytes: number; sha256: string };
/** A recorded measurement plus, when known, the verified published copy's ETag + size. */
export type AudioProvenance = AudioFingerprint & { published: { sizeBytes: number; etag: string } | null };
export type StoredAudioMeasurement = AudioFingerprint & { seconds: number };

/**
 * Downloads the stored object once and, from those same bytes, measures it
 * (lib/media/audioDuration) and fingerprints it. Null when the length cannot
 * be determined - the caller refuses the upload (fail closed).
 */
export async function measureStoredAudio(ref: string, ext: string): Promise<StoredAudioMeasurement | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.storage.from(MEDIA_BUCKET).download(ref, {}, { cache: "no-store" });
    if (error || !data || data.size > MAX_AUDIO_BYTES || data.size <= 0) return null;
    const bytes = new Uint8Array(await data.arrayBuffer());
    const result = deriveAudioDuration(bytes, ext);
    if (!result.ok) return null;
    return { seconds: toWholeSeconds(result.seconds), sizeBytes: bytes.byteLength, sha256: sha256Hex(bytes) };
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
 *
 * TASK 032 (0046): the write goes through billing_audio_attach_verified(),
 * which records the server's measurement (ref, whole seconds, size, sha256)
 * and writes the metadata in ONE transaction. A bare service-role update of
 * the file fields is refused by the database (AUDIO_UNVERIFIED).
 */
export async function writeEnforcedAudioFile(
  tenantId: string,
  itemId: string,
  metadata: Record<string, unknown>,
  fingerprint: AudioFingerprint
): Promise<EnforcedAudioWrite> {
  try {
    const admin = createAdminClient();
    const { data: writable, error: writableError } = await admin.rpc("space_studio_writable", { p_tenant_id: tenantId });
    if (writableError) return { ok: false, reason: "failed" };
    if (writable !== true) return { ok: false, reason: "studioLocked" };
    const { error } = await admin.rpc("billing_audio_attach_verified", {
      p_tenant_id: tenantId,
      p_item_id: itemId,
      p_metadata: metadata,
      p_size_bytes: fingerprint.sizeBytes,
      p_sha256: fingerprint.sha256,
    });
    if (error) return { ok: false, reason: error.hint === "AUDIO_LIMIT" ? "limit" : "failed" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/**
 * TASK 032 (0046): the recorded fingerprints of this Space's attached audio,
 * keyed by the draft ref, for the publish-time comparison. Null when they
 * cannot be read (the publish then fails closed). `published` is the ETag +
 * size of the published copy recorded the last time publish hashed it and
 * found it equal (lib/media/publish.ts skips the re-hash only while Storage
 * still reports exactly that ETag and size).
 */
export async function loadAudioFingerprints(tenantId: string): Promise<Map<string, AudioProvenance> | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("billing_audio_verifications")
      .select("audio_ref, size_bytes, sha256, published_size_bytes, published_sha256, published_etag")
      .eq("tenant_id", tenantId);
    if (error || !data) return null;
    type Row = {
      audio_ref: string;
      size_bytes: number | string;
      sha256: string;
      published_size_bytes: number | string | null;
      published_sha256: string | null;
      published_etag: string | null;
    };
    return new Map(
      (data as Row[]).map((r) => {
        const sizeBytes = Number(r.size_bytes);
        const publishedSize = r.published_size_bytes === null ? null : Number(r.published_size_bytes);
        const published =
          r.published_etag && r.published_sha256 === r.sha256 && publishedSize === sizeBytes
            ? { sizeBytes: publishedSize, etag: r.published_etag }
            : null;
        return [r.audio_ref, { sizeBytes, sha256: r.sha256, published }];
      })
    );
  } catch {
    return null;
  }
}

/**
 * TASK 032 (0046): records that the published copy of `ref` was hashed and
 * equals the measured fingerprint, with the Storage ETag it had when read.
 * Only updates the row whose ref AND fingerprint still match (a re-measured
 * row is left alone). Best-effort: a failure only means the next publish
 * hashes the copy again.
 */
export async function recordPublishedAudioFingerprint(
  tenantId: string,
  ref: string,
  fingerprint: AudioFingerprint,
  etag: string
): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin
      .from("billing_audio_verifications")
      .update({
        published_size_bytes: fingerprint.sizeBytes,
        published_sha256: fingerprint.sha256,
        published_etag: etag.slice(0, 256),
        published_verified_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId)
      .eq("audio_ref", ref)
      .eq("sha256", fingerprint.sha256)
      .eq("size_bytes", fingerprint.sizeBytes);
  } catch {
    // best-effort (see above)
  }
}
