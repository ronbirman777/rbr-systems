"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";
import { getSpaceEntitlement } from "@/lib/entitlements/getSpaceEntitlement";
import { deriveCommercialAvailability } from "@/lib/entitlements/availability";
import { getCustomPagesLimit } from "@/lib/entitlements/customPagesLimit";
import {
  MEDIA_BUCKET,
  ALLOWED_IMAGE_TYPES,
  OPTIMIZED_IMAGE_EXTENSION,
  OPTIMIZED_IMAGE_MIME,
  isFileSizeAllowed,
  isDraftMediaPathForTenant,
  collectMediaRefs,
  newUploadId,
  tenantMediaPath,
  versionedMediaPath,
} from "@/lib/media/path";
import { cleanupStalePublishedMedia } from "@/lib/media/publishedCleanup";
import { copyDraftAudioToPublished, copyDraftToPublished } from "@/lib/media/publish";
import { removeDraftObjects } from "@/lib/media/draftCleanup";
import {
  AUDIO_ALLOWED_TYPES,
  MAX_AUDIO_BYTES,
  isAudioSizeAllowed,
  normalizeMimeType,
  parseAudioDraftRef,
} from "@/lib/media/audio";
import { getPublishAvailability } from "@/lib/spaceTypes/publishAvailability";
import { optimizeImageToWebp } from "@/lib/media/optimizeImage";
import {
  TEACH_AUDIO_FOLDER_KEY,
  TEACH_EDITABLE_ITEM_KEYS,
  TEACH_EXPLORE_MODULES,
  TEACH_MEDIA_ITEM_KEYS,
  TEACH_PRODUCT_TYPE,
  TEACH_SETTINGS_KEYS,
  TEACH_SETTINGS_SCHEMAS,
  collectTeachMediaRefs,
  isTenantMediaRef,
  teachItemFieldsSchema,
  type TeachEditableItemKey,
  type TeachSettingsKey,
  type ClassMetadata,
  RECURRENCE_MAX_EXCEPTIONS,
  isInvalidStored,
} from "@/lib/teach/schemas";
import { computeClassTimes } from "@/lib/teach/classTime";
import { validateRecurrence } from "@/lib/teach/recurrence";
import { DEFAULT_TEACH_PRESET } from "@/lib/teach/style";
import { SPACE_TYPES } from "@/lib/spaceTypes/registry";

/**
 * Time to Teach Studio server actions.
 *
 * Every write goes through the signed-in user's own RLS-scoped client (never
 * the admin client) - the same tenant-membership policies that protect Time
 * to Flow protect every row here. Payloads are validated with the zod
 * content model in src/lib/teach/schemas.ts before anything is written.
 *
 * Reused as-is from Time to Flow (imported by the Studio client directly):
 * uploadModuleItemPhoto / removeModuleItemPhoto (item images),
 * uploadBrandImage / removeBrandImage (primary image), createModuleItemStub,
 * checkSlugAvailability / reserveSlug (guest address).
 */

export type TeachActionState = { error: string | null; warnings?: string[] };
const OK: TeachActionState = { error: null };

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Confirms the tenant is visible to this user (RLS) and is a Teach Space. */
async function requireTeachTenant(supabase: SupabaseClient, tenantId: string): Promise<boolean> {
  return (await loadTeachTenant(supabase, tenantId)) !== null;
}

/** Same guard, also returning the Space's time zone (legacy class fallback). */
async function loadTeachTenant(supabase: SupabaseClient, tenantId: string): Promise<{ timezone: string } | null> {
  if (!z.string().uuid().safeParse(tenantId).success) return null;
  const { data } = await supabase.from("tenants").select("product_type, timezone").eq("id", tenantId).maybeSingle();
  return data?.product_type === TEACH_PRODUCT_TYPE ? { timezone: data.timezone ?? DEFAULT_TIMEZONE } : null;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Create New Space -> Time to Teach. Creates the tenant immediately (the
 * slot trigger, enforce_space_slot_capacity() in 0017, is the real capacity
 * check) with calm defaults, then opens the Teach Studio.
 */
export async function createTeachSpace(): Promise<void> {
  const { supabase, user } = await requireUser();
  if (!user) redirect("/log-in");

  const { data: tenant, error } = await supabase
    .from("tenants")
    .insert({ name: SPACE_TYPES.teach.copy.untitledName, product_type: TEACH_PRODUCT_TYPE, timezone: DEFAULT_TIMEZONE })
    .select("id")
    .single();
  if (error || !tenant) {
    redirect(error?.hint === "SLOT_LIMIT_REACHED" ? "/create?error=slots" : "/create?error=create");
  }

  await supabase.from("brand_configs").upsert({
    tenant_id: tenant.id,
    name: SPACE_TYPES.teach.copy.untitledName,
    custom_primary: DEFAULT_TEACH_PRESET.primary,
    custom_secondary: DEFAULT_TEACH_PRESET.accent,
    updated_at: new Date().toISOString(),
  });
  await supabase.from("module_settings").upsert({
    tenant_id: tenant.id,
    module_key: "teachStyle",
    data: TEACH_SETTINGS_SCHEMAS.teachStyle.parse({ preset: DEFAULT_TEACH_PRESET.key, background: DEFAULT_TEACH_PRESET.background }),
  });
  await supabase.from("module_configs").upsert(
    ["teachReadings", "teachAudio", "teachContact"].map((module_key) => ({ tenant_id: tenant.id, module_key, enabled: true })),
    { onConflict: "tenant_id,module_key" }
  );

  redirect(`/configurator/teach/${tenant.id}`);
}

// ---------------------------------------------------------------------------
// Identity & brand colours
// ---------------------------------------------------------------------------

const identitySchema = z.object({
  name: z.string().trim().min(1, "Please add your name.").max(80),
  timezone: z.string().min(1).max(64),
});

export async function saveTeachIdentity(tenantId: string, input: { name: string; timezone: string }): Promise<TeachActionState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You need to be logged in to save." };
  if (!(await requireTeachTenant(supabase, tenantId))) return { error: "Space not found." };
  const parsed = identitySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check your details." };
  const valid = (() => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: parsed.data.timezone });
      return true;
    } catch {
      return false;
    }
  })();
  if (!valid) return { error: "That time zone isn't recognised." };

  const { error } = await supabase
    .from("tenants")
    .update({ name: parsed.data.name, timezone: parsed.data.timezone })
    .eq("id", tenantId);
  if (error) return { error: error.message };
  await supabase
    .from("brand_configs")
    .upsert({ tenant_id: tenantId, name: parsed.data.name, updated_at: new Date().toISOString() }, { onConflict: "tenant_id" });
  return OK;
}

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export async function saveTeachBrandColors(
  tenantId: string,
  input: { primary: string; accent: string; navigation: string | null; text: string | null }
): Promise<TeachActionState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You need to be logged in to save." };
  if (!(await requireTeachTenant(supabase, tenantId))) return { error: "Space not found." };
  const parsed = z
    .object({ primary: hex, accent: hex, navigation: hex.nullable(), text: hex.nullable() })
    .safeParse(input);
  if (!parsed.success) return { error: "Colours must be 6-digit hex values like #5B7A6E." };
  const { error } = await supabase.from("brand_configs").upsert(
    {
      tenant_id: tenantId,
      custom_primary: parsed.data.primary,
      custom_secondary: parsed.data.accent,
      custom_navigation: parsed.data.navigation,
      custom_text: parsed.data.text,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id" }
  );
  if (error) return { error: error.message };
  return OK;
}

// ---------------------------------------------------------------------------
// Settings (module_settings singletons)
// ---------------------------------------------------------------------------

export async function saveTeachSettings(tenantId: string, key: TeachSettingsKey, data: unknown): Promise<TeachActionState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You need to be logged in to save." };
  if (!(TEACH_SETTINGS_KEYS as readonly string[]).includes(key)) return { error: "Unknown section." };
  if (!(await requireTeachTenant(supabase, tenantId))) return { error: "Space not found." };

  const parsed = (TEACH_SETTINGS_SCHEMAS[key] as z.ZodTypeAny).safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Some details weren't valid." };
  // Any media reference must be one of this tenant's own draft objects.
  for (const ref of collectTeachMediaRefs(parsed.data)) {
    if (!isTenantMediaRef(tenantId, ref)) return { error: "An image reference wasn't valid - please re-upload it." };
  }

  const { error } = await supabase
    .from("module_settings")
    .upsert(
      { tenant_id: tenantId, module_key: key, data: parsed.data, updated_at: new Date().toISOString() },
      { onConflict: "tenant_id,module_key" }
    );
  if (error) return { error: error.message };
  return OK;
}

// ---------------------------------------------------------------------------
// Items (module_items)
// ---------------------------------------------------------------------------

/**
 * The draft objects an item's row currently references (its image and its
 * audio file) - exactly what deleting the item should clean up. Published
 * copies are never listed: they stay until the post-publish sweep, so
 * deleting an item in the Studio never breaks media guests can still see.
 */
async function itemDraftRefs(supabase: SupabaseClient, tenantId: string, itemIds: string[]): Promise<string[]> {
  if (itemIds.length === 0) return [];
  const { data } = await supabase.from("module_items").select("id, image_ref, metadata").eq("tenant_id", tenantId).in("id", itemIds);
  const refs: string[] = [];
  for (const row of data ?? []) {
    if (typeof row.image_ref === "string") refs.push(row.image_ref);
    const audioRef = (row.metadata as { audioRef?: unknown } | null)?.audioRef;
    if (typeof audioRef === "string") refs.push(audioRef);
  }
  return refs;
}

/**
 * Upsert-by-id / delete-only-removed, exactly like Time to Flow's
 * saveModuleItemsGeneric - and like it, Save never writes image_ref (owned
 * by the upload/remove actions), so an upload finishing mid-save can't be
 * reverted by a stale snapshot.
 */
export async function saveTeachItems(
  tenantId: string,
  moduleKey: TeachEditableItemKey,
  items: unknown
): Promise<TeachActionState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You need to be logged in to save." };
  if (!TEACH_EDITABLE_ITEM_KEYS.includes(moduleKey)) return { error: "Unknown section." };
  const tenant = await loadTeachTenant(supabase, tenantId);
  if (!tenant) return { error: "Space not found." };
  if (!Array.isArray(items)) return { error: "Could not read the list." };
  const warnings: string[] = [];

  if (moduleKey === "customPages") {
    const entitlement = await getSpaceEntitlement(supabase, tenantId);
    const limit = getCustomPagesLimit(entitlement);
    if (items.length > limit) return { error: `Your plan allows up to ${limit} custom pages.` };
  }

  const schema = teachItemFieldsSchema(moduleKey);
  const rows = [];
  for (const [index, raw] of items.entries()) {
    const id = (raw as { id?: unknown })?.id;
    if (typeof id !== "string" || !z.string().uuid().safeParse(id).success) return { error: "Could not read the list." };
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Some details weren't valid." };
    const audioRef = (parsed.data.metadata as { audioRef?: string | null }).audioRef;
    if (audioRef) {
      const parts = parseAudioDraftRef(audioRef);
      if (!parts || parts.tenantId !== tenantId || parts.moduleKey !== TEACH_AUDIO_FOLDER_KEY || parts.itemId !== id) {
        return { error: "An audio file reference wasn't valid - please re-upload it." };
      }
    }
    // Canonical class time (time model v1): recompute the UTC instants from
    // the local wall time + explicit zone on every save. Client-sent
    // startsAt/endsAt are never trusted - they are overwritten here.
    let metadata = parsed.data.metadata as Record<string, unknown>;
    if (moduleKey === "teachClasses") {
      const times = computeClassTimes(parsed.data.metadata as ClassMetadata, tenant.timezone);
      if (!times.ok) return { error: `“${parsed.data.title}”: ${times.issues[0].message}` };
      // Recurring series: the rule and its exceptions are validated here;
      // occurrences are never stored (they are expanded when read).
      const rawExceptions = (raw as { metadata?: { exceptions?: unknown } })?.metadata?.exceptions;
      if (rawExceptions && typeof rawExceptions === "object" && Object.keys(rawExceptions).length > RECURRENCE_MAX_EXCEPTIONS) {
        return { error: `“${parsed.data.title}”: too many changed or cancelled dates on one class.` };
      }
      const recurrenceIssue = validateRecurrence(times.metadata, tenant.timezone);
      if (recurrenceIssue) return { error: `“${parsed.data.title}”: ${recurrenceIssue.message}` };
      // Malformed stored recurrence data is never normalized here (e.g. into
      // a one-off on an unrelated save): it is written back exactly as it
      // was until the teacher repairs it in the Studio.
      const keepRaw = (v: unknown) => (isInvalidStored(v) ? v.raw : v);
      const recurrenceOut = keepRaw(times.metadata.recurrence);
      const exceptionsOut = keepRaw(times.metadata.exceptions);
      if ((JSON.stringify([recurrenceOut, exceptionsOut]) ?? "").length > 40_000) {
        return { error: `“${parsed.data.title}”: its repeat settings are damaged and too large to keep - please repair them.` };
      }
      metadata = { ...(times.metadata as unknown as Record<string, unknown>), recurrence: recurrenceOut, exceptions: exceptionsOut, occurrence: null };
      for (const w of times.warnings) warnings.push(`“${parsed.data.title}”: ${w.message}`);
    }
    rows.push({
      id,
      tenant_id: tenantId,
      module_key: moduleKey,
      // Optional-title kinds (gallery captions, availability labels) keep an
      // empty title so guests see the intended default, never "Untitled".
      title: parsed.data.title ?? "",
      subtitle: parsed.data.subtitle,
      description: parsed.data.description,
      external_link: parsed.data.externalLink,
      sort_order: index,
      metadata,
    });
  }

  const incoming = new Set(rows.map((r) => r.id));
  const { data: existing } = await supabase
    .from("module_items")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("module_key", moduleKey);
  const removed = (existing ?? []).filter((r) => !incoming.has(r.id)).map((r) => r.id);
  if (removed.length > 0) {
    const staleRefs = await itemDraftRefs(supabase, tenantId, removed);
    const { error } = await supabase.from("module_items").delete().eq("tenant_id", tenantId).in("id", removed);
    if (error) return { error: error.message };
    await removeDraftObjects(supabase, tenantId, staleRefs);
  }
  if (rows.length > 0) {
    const { error } = await supabase.from("module_items").upsert(rows, { onConflict: "id" });
    if (error) return { error: error.message };
  }
  return warnings.length ? { error: null, warnings } : OK;
}

/** Removes one item immediately: its row, then its own draft image/audio objects. */
export async function deleteTeachItem(tenantId: string, moduleKey: TeachEditableItemKey, itemId: string): Promise<TeachActionState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You need to be logged in." };
  if (!TEACH_EDITABLE_ITEM_KEYS.includes(moduleKey)) return { error: "Unknown section." };
  if (!(await requireTeachTenant(supabase, tenantId))) return { error: "Space not found." };
  if (!z.string().uuid().safeParse(itemId).success) return { error: "Missing item." };
  const staleRefs = await itemDraftRefs(supabase, tenantId, [itemId]);
  const { error } = await supabase.from("module_items").delete().eq("id", itemId).eq("tenant_id", tenantId);
  if (error) return { error: error.message };
  await removeDraftObjects(supabase, tenantId, staleRefs);
  return OK;
}

// ---------------------------------------------------------------------------
// Explore modules (module_configs)
// ---------------------------------------------------------------------------

export async function saveTeachModules(tenantId: string, enabled: string[]): Promise<TeachActionState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You need to be logged in to save." };
  if (!(await requireTeachTenant(supabase, tenantId))) return { error: "Space not found." };
  const on = new Set(enabled);
  const rows = TEACH_EXPLORE_MODULES.map((module_key) => ({ tenant_id: tenantId, module_key, enabled: on.has(module_key) }));
  const { error } = await supabase.from("module_configs").upsert(rows, { onConflict: "tenant_id,module_key" });
  if (error) return { error: error.message };
  return OK;
}

// ---------------------------------------------------------------------------
// Settings-level images (About profile, Contact cover, Explore card covers)
// ---------------------------------------------------------------------------

const SETTINGS_IMAGE_SLOTS: Record<string, readonly string[]> = {
  teachAbout: ["profile"],
  teachContact: ["cover"],
  teachExplore: ["teachReadings", "teachAudio", "teachContact"],
};

export type TeachUploadState = { error: string | null; imageRef: string | null; imageUrl: string | null };

/**
 * Uploads an image for a settings slot and returns its draft ref; the Studio
 * then stores the ref in that settings object and saves it (saveTeachSettings
 * re-checks the ref belongs to this tenant). Same re-encode and path
 * conventions as every other upload.
 */
export async function uploadTeachSettingsImage(formData: FormData): Promise<TeachUploadState> {
  const fail = (error: string): TeachUploadState => ({ error, imageRef: null, imageUrl: null });
  const { supabase, user } = await requireUser();
  if (!user) return fail("You need to be logged in.");
  const tenantId = String(formData.get("tenantId") ?? "");
  const key = String(formData.get("settingsKey") ?? "");
  const slot = String(formData.get("slot") ?? "");
  const file = formData.get("file");
  if (!SETTINGS_IMAGE_SLOTS[key]?.includes(slot)) return fail("Unknown image slot.");
  if (!(await requireTeachTenant(supabase, tenantId))) return fail("Space not found.");
  if (!(file instanceof File) || file.size === 0) return fail("No file selected.");
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return fail("Please upload a JPG, PNG or WEBP image.");
  if (!isFileSizeAllowed(file.size)) return fail("Image must be under 8MB.");

  let optimized: Buffer;
  try {
    optimized = await optimizeImageToWebp(file);
  } catch {
    return fail("That image could not be processed. Try a different file.");
  }
  // A new uploadId per upload: an existing object is never overwritten.
  const path = tenantMediaPath(tenantId, key, slot, OPTIMIZED_IMAGE_EXTENSION, newUploadId());
  const { error: uploadError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, optimized, { upsert: false, contentType: OPTIMIZED_IMAGE_MIME });
  if (uploadError) return fail(uploadError.message);
  const { data: signed } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path, 3600);
  return { error: null, imageRef: path, imageUrl: signed?.signedUrl ?? null };
}

/**
 * Deletes one of this tenant's own draft settings images. Audio files are
 * excluded on purpose: they go through detachTeachAudio, which clears the
 * row's reference in the same step so it never points at a removed object.
 */
export async function removeTeachDraftMedia(tenantId: string, ref: string): Promise<TeachActionState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You need to be logged in." };
  if (!(await requireTeachTenant(supabase, tenantId))) return { error: "Space not found." };
  if (!isTenantMediaRef(tenantId, ref) || ref.split("/")[1] === TEACH_AUDIO_FOLDER_KEY) return { error: "Unknown media." };
  const { error } = await supabase.storage.from(MEDIA_BUCKET).remove([ref]);
  if (error) return { error: error.message };
  return OK;
}


// ---------------------------------------------------------------------------
// Audio files: versioned, immutable draft objects
//
// Audio is uploaded browser -> Storage directly (files up to 100 MB; server
// actions are capped at 10 MB), so the server brackets the upload instead of
// carrying it:
//   1. prepareTeachAudioUpload - validates the type and size, makes sure the
//      teachAudio row exists BEFORE any bytes land, and returns a brand-new
//      versioned path `{tenant}/teachAudioFile/{item}/{uploadId}/draft.<ext>`.
//      Every upload gets its own uploadId, so nothing is ever overwritten
//      (the client uploads with upsert:false).
//   2. attachTeachAudio - verifies the object that actually landed (size and
//      content type from Storage metadata - the real server-side limit),
//      points the row at it, and only THEN removes the one draft it replaced.
//      A failed upload or DB update leaves the previous reference and its
//      file untouched.
//   3. detachTeachAudio - clears the reference, then removes that one draft.
// published.* copies are never touched here: they are created by publish
// (copyDraftAudioToPublished) and removed only after a successful republish.
// ---------------------------------------------------------------------------

async function loadTeachItemRow(supabase: SupabaseClient, tenantId: string, itemId: string) {
  const { data } = await supabase.from("module_items").select("id, module_key, metadata").eq("tenant_id", tenantId).eq("id", itemId);
  return (data?.[0] ?? null) as { id: string; module_key: string; metadata: Record<string, unknown> | null } | null;
}

const currentAudioRef = (row: { metadata: Record<string, unknown> | null } | null): string | null => {
  const ref = row?.metadata?.audioRef;
  return typeof ref === "string" ? ref : null;
};

export type TeachAudioUploadState = { error: string | null; path: string | null };

export async function prepareTeachAudioUpload(
  tenantId: string,
  item: unknown,
  sortOrder: number,
  mimeType: string,
  sizeBytes: number
): Promise<TeachAudioUploadState> {
  const fail = (error: string): TeachAudioUploadState => ({ error, path: null });
  const { supabase, user } = await requireUser();
  if (!user) return fail("You need to be logged in.");
  if (!(await requireTeachTenant(supabase, tenantId))) return fail("Space not found.");
  const itemId = (item as { id?: unknown } | null)?.id;
  if (typeof itemId !== "string" || !z.string().uuid().safeParse(itemId).success) return fail("Missing item.");
  const ext = typeof mimeType === "string" ? AUDIO_ALLOWED_TYPES[normalizeMimeType(mimeType)] : undefined;
  if (!ext) return fail("Please upload an MP3, M4A, AAC, WAV or OGG audio file.");
  if (!isAudioSizeAllowed(sizeBytes)) return fail(`Audio files must be under ${MAX_AUDIO_BYTES / (1024 * 1024)}MB.`);

  const existing = await loadTeachItemRow(supabase, tenantId, itemId);
  if (existing && existing.module_key !== "teachAudio") return fail("Missing item.");
  if (!existing) {
    const raw = item as Record<string, unknown>;
    const parsed = teachItemFieldsSchema("teachAudio").safeParse({ ...raw, title: String(raw.title ?? "").trim() || "Untitled audio" });
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Some details weren't valid.");
    const { error } = await supabase.from("module_items").insert({
      id: itemId,
      tenant_id: tenantId,
      module_key: "teachAudio",
      title: parsed.data.title ?? "Untitled audio",
      subtitle: parsed.data.subtitle,
      description: parsed.data.description,
      external_link: parsed.data.externalLink,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
      // The file isn't attached until attachTeachAudio confirms the upload.
      metadata: { ...(parsed.data.metadata as Record<string, unknown>), audioRef: null, durationSeconds: null },
    });
    if (error) return fail(error.message);
  }
  return {
    error: null,
    path: versionedMediaPath("draft", { tenantId, moduleKey: TEACH_AUDIO_FOLDER_KEY, itemId, uploadId: newUploadId(), ext }),
  };
}

export async function attachTeachAudio(tenantId: string, itemId: string, ref: string, durationSeconds: number | null): Promise<TeachActionState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You need to be logged in." };
  if (!(await requireTeachTenant(supabase, tenantId))) return { error: "Space not found." };
  if (!z.string().uuid().safeParse(itemId).success) return { error: "Missing item." };
  const parts = typeof ref === "string" ? parseAudioDraftRef(ref) : null;
  if (!parts || parts.tenantId !== tenantId || parts.moduleKey !== TEACH_AUDIO_FOLDER_KEY || parts.itemId !== itemId) {
    return { error: "An audio file reference wasn't valid." };
  }
  const row = await loadTeachItemRow(supabase, tenantId, itemId);
  if (!row || row.module_key !== "teachAudio") return { error: "Missing item." };
  const previousRef = currentAudioRef(row);
  const duration = typeof durationSeconds === "number" && Number.isFinite(durationSeconds) && durationSeconds >= 0 && durationSeconds <= 60 * 60 * 12 ? Math.round(durationSeconds) : null;

  // The upload is browser -> Storage, so the real size/type limits are
  // enforced here against what Storage actually stored. Anything that
  // doesn't pass (or can't be verified) is rejected, and a rejected NEW
  // upload is removed - it is unreferenced, so nothing else points at it.
  const bucket = supabase.storage.from(MEDIA_BUCKET);
  const reject = async (message: string): Promise<TeachActionState> => {
    if (ref !== previousRef) await removeDraftObjects(supabase, tenantId, [ref]);
    return { error: message };
  };
  const { data: info, error: infoError } = await bucket.info(ref);
  if (infoError || !info) return { error: "The upload didn't finish - please try again." };
  if (!isAudioSizeAllowed(Number(info.size))) return reject(`Audio files must be under ${MAX_AUDIO_BYTES / (1024 * 1024)}MB.`);
  if (AUDIO_ALLOWED_TYPES[normalizeMimeType(String(info.contentType ?? ""))] !== parts.ext) {
    return reject("Please upload an MP3, M4A, AAC, WAV or OGG audio file.");
  }

  if (ref !== previousRef) {
    // A published object already living in this upload's folder is never a
    // fresh upload; refuse to adopt the folder rather than risk replacing
    // what the live snapshot may reference.
    const published = versionedMediaPath("published", { ...parts });
    const { data: publishedExists } = await bucket.exists(published);
    if (publishedExists) return { error: "An audio file reference wasn't valid - please re-upload it." };
  }

  const { error } = await supabase
    .from("module_items")
    .update({ metadata: { ...(row.metadata ?? {}), audioRef: ref, durationSeconds: duration } })
    .eq("tenant_id", tenantId)
    .eq("id", itemId);
  if (error) {
    if (ref !== previousRef) await removeDraftObjects(supabase, tenantId, [ref]);
    return { error: error.message };
  }
  // Committed: the replaced draft (only that one) is now unreferenced.
  if (previousRef && previousRef !== ref) await removeDraftObjects(supabase, tenantId, [previousRef]);
  return OK;
}

export async function detachTeachAudio(tenantId: string, itemId: string): Promise<TeachActionState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You need to be logged in." };
  if (!(await requireTeachTenant(supabase, tenantId))) return { error: "Space not found." };
  if (!z.string().uuid().safeParse(itemId).success) return { error: "Missing item." };
  const row = await loadTeachItemRow(supabase, tenantId, itemId);
  if (!row) return OK;
  if (row.module_key !== "teachAudio") return { error: "Missing item." };
  const previousRef = currentAudioRef(row);
  const { error } = await supabase
    .from("module_items")
    .update({ metadata: { ...(row.metadata ?? {}), audioRef: null, durationSeconds: null } })
    .eq("tenant_id", tenantId)
    .eq("id", itemId);
  if (error) return { error: error.message };
  await removeDraftObjects(supabase, tenantId, [previousRef]);
  return OK;
}

// ---------------------------------------------------------------------------
// Publish
// ---------------------------------------------------------------------------

export type TeachPublishState = { error: string | null; publishedAt: string | null };

/**
 * Time to Teach publish. Same media-ordering contract as Time to Flow's
 * publishSpace (TASK 023 - published media is an immutable snapshot):
 *  1. read the CURRENT snapshot's media refs (previousRefs);
 *  2. copy every current draft media object (item images, audio, brand
 *     images, settings images) to its published key inside the same
 *     uploadId folder - create-only, so nothing the live snapshot
 *     references is touched, and any failure stops BEFORE the RPC;
 *  3. call publish_space(), the single atomic commit (it adds the Teach
 *     payload only for product_type 'teach');
 *  4. only after it commits, best-effort remove published objects the new
 *     snapshot no longer references. A cleanup failure is logged and never
 *     fails the Publish.
 * Availability is decided by the registry (getPublishAvailability) and the
 * product type is re-verified from the DB here, never from the client.
 */
export async function publishTeachSpace(tenantId: string): Promise<TeachPublishState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You need to be logged in.", publishedAt: null };
  if (!(await requireTeachTenant(supabase, tenantId))) return { error: "Space not found.", publishedAt: null };

  const publishGate = getPublishAvailability(TEACH_PRODUCT_TYPE);
  if (!publishGate.available) return { error: publishGate.message, publishedAt: null };

  const availability = deriveCommercialAvailability(await getSpaceEntitlement(supabase, tenantId));
  if (!availability.canPublish) {
    return { error: "This Space needs active access before it can be published.", publishedAt: null };
  }

  const { data: previousSnapshot } = await supabase
    .from("published_spaces")
    .select("modules")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const previousRefs = collectMediaRefs(previousSnapshot?.modules ?? null);

  const [{ data: itemRows }, { data: brandRow }, { data: settingsRows }, { data: coverRows }] = await Promise.all([
    supabase
      .from("module_items")
      .select("id, module_key, image_ref, metadata")
      .eq("tenant_id", tenantId)
      .in("module_key", TEACH_MEDIA_ITEM_KEYS as string[]),
    supabase.from("brand_configs").select("hero_image_ref, space_image_ref, logo_ref").eq("tenant_id", tenantId).maybeSingle(),
    supabase.from("module_settings").select("module_key, data").eq("tenant_id", tenantId).in("module_key", Object.keys(SETTINGS_IMAGE_SLOTS)),
    supabase.from("module_configs").select("image_ref").eq("tenant_id", tenantId),
  ]);

  const settingsByKey = new Map((settingsRows ?? []).map((r) => [r.module_key as string, r.data as Record<string, unknown>]));
  const slotRef = (key: string, slot: string): string | null => {
    const data = settingsByKey.get(key) ?? {};
    const node = key === "teachExplore" ? (data.cards as Record<string, unknown> | undefined)?.[slot] : data[slot];
    const ref = (node as { imageRef?: unknown } | undefined)?.imageRef;
    return typeof ref === "string" && isTenantMediaRef(tenantId, ref) ? ref : null;
  };

  const jobs: Promise<unknown>[] = [];
  for (const ref of [
    brandRow?.hero_image_ref ?? null,
    brandRow?.space_image_ref ?? null,
    brandRow?.logo_ref ?? null,
    ...(coverRows ?? []).map((r) => r.image_ref as string | null),
  ]) {
    if (ref && isDraftMediaPathForTenant(tenantId, ref)) jobs.push(copyDraftToPublished(supabase, ref));
  }
  for (const row of itemRows ?? []) {
    const imageRef = typeof row.image_ref === "string" && isDraftMediaPathForTenant(tenantId, row.image_ref) ? row.image_ref : null;
    jobs.push(copyDraftToPublished(supabase, imageRef));
    if (row.module_key === "teachAudio") {
      const audioRef = (row.metadata as { audioRef?: unknown } | null)?.audioRef;
      jobs.push(copyDraftAudioToPublished(supabase, typeof audioRef === "string" ? audioRef : null));
    }
  }
  for (const [key, slots] of Object.entries(SETTINGS_IMAGE_SLOTS)) {
    for (const slot of slots) jobs.push(copyDraftToPublished(supabase, slotRef(key, slot)));
  }

  try {
    await Promise.all(jobs);
  } catch (err) {
    return {
      error: err instanceof Error ? `Could not publish your media - ${err.message}` : "Could not publish your media.",
      publishedAt: null,
    };
  }

  const { data, error } = await supabase.rpc("publish_space", { p_tenant_id: tenantId });
  if (error) return { error: error.message, publishedAt: null };

  try {
    const { data: committed, error: readError } = await supabase
      .from("published_spaces")
      .select("modules")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (readError || !committed) throw new Error(readError?.message ?? "snapshot not readable");
    await cleanupStalePublishedMedia(supabase, tenantId, previousRefs, collectMediaRefs(committed.modules));
  } catch (cleanupError) {
    console.error("publishTeachSpace: stale published media cleanup failed", {
      tenantId,
      message: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
    });
  }

  return { error: null, publishedAt: data as string };
}
