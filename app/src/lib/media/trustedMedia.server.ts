import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAudioQuotaPolicy } from "@/lib/billing/audioQuota.server";
import { isCanonicalStoredImage } from "./imageSignature";
import { MEDIA_BUCKET, OPTIMIZED_IMAGE_EXTENSION, OPTIMIZED_IMAGE_MIME, isDraftMediaPathForTenant } from "./path";

/**
 * Who writes tenant-media objects for one Space - TASK 032, migration 0045.
 *
 * On a billing-governed (paid, non-exempt) Space, 0045's restrictive Storage
 * policies let a member session create only versioned DRAFT AUDIO objects
 * (`.../{uploadId}/draft.{mp3|m4a|aac|wav|ogg}`, the browser-direct audio
 * upload) and never update an object. Every image object and every published
 * copy (image or audio) on such a Space is therefore written by the service
 * role, here, after the server has validated the bytes itself. That is what
 * makes an image reference on a paid Space trustworthy: whatever bytes sit at
 * an image path were produced by sharp from an upload that passed
 * sniffImage, and nothing a member uploads directly can be put there.
 *
 * Legacy (no billing row) and exempt Spaces keep the member-session writes
 * exactly as before (`trusted: false`, the caller's own client). The content
 * check before sharp (sniffImage, in the optimizers) applies to every Space.
 *
 * "unavailable" (a paid row whose entitlement cannot be read) fails closed.
 */
export type MediaWriter =
  | { ok: true; client: SupabaseClient; trusted: boolean }
  | { ok: false; reason: "studioLocked" | "unavailable" };

export async function resolveMediaWriter(supabase: SupabaseClient, tenantId: string): Promise<MediaWriter> {
  const policy = await loadAudioQuotaPolicy(tenantId);
  if (policy.mode === "unenforced") return { ok: true, client: supabase, trusted: false };
  if (policy.mode !== "enforced") return { ok: false, reason: "unavailable" };
  try {
    // The service role bypasses Storage RLS, so the two things RLS would
    // have checked for a member write are checked explicitly first: the
    // signed-in caller is a member of this tenant (through THEIR session),
    // and billing has not suspended Studio writes (0039's rule).
    const { data: member, error: memberError } = await supabase.rpc("is_tenant_member", { check_tenant_id: tenantId });
    if (memberError || member !== true) return { ok: false, reason: "unavailable" };
    const admin = createAdminClient();
    const { data: writable, error: writableError } = await admin.rpc("space_studio_writable", { p_tenant_id: tenantId });
    if (writableError) return { ok: false, reason: "unavailable" };
    if (writable !== true) return { ok: false, reason: "studioLocked" };
    return { ok: true, client: admin, trusted: true };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export type StoreDraftImageResult = { error: null } | { error: "studioLocked" | "unavailable" | "invalid" | string };

/**
 * Stores one re-encoded draft image (sharp output) at `path`. Refuses a path
 * that is not this tenant's own `draft.webp`, and - on the trusted path -
 * bytes that are not a canonical WebP. upsert:false, as before: a fresh
 * versioned path is never an overwrite.
 */
export async function storeDraftImage(
  supabase: SupabaseClient,
  tenantId: string,
  path: string,
  optimized: Uint8Array
): Promise<StoreDraftImageResult> {
  if (!isDraftMediaPathForTenant(tenantId, path) || !path.endsWith(`/draft.${OPTIMIZED_IMAGE_EXTENSION}`)) {
    return { error: "invalid" };
  }
  const writer = await resolveMediaWriter(supabase, tenantId);
  if (!writer.ok) return { error: writer.reason };
  // Defense in depth on the trusted path: sharp's own WebP output always
  // passes. (On a legacy/exempt Space a member can write any bytes into their
  // own folder directly anyway - unchanged, documented - so the legacy path
  // keeps its previous behaviour byte for byte.)
  if (writer.trusted && !isCanonicalStoredImage(optimized)) return { error: "invalid" };
  const { error } = await writer.client.storage
    .from(MEDIA_BUCKET)
    .upload(path, optimized, { upsert: false, contentType: OPTIMIZED_IMAGE_MIME });
  return error ? { error: error.message } : { error: null };
}
