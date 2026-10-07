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
  TEACH_DIRECTORY_KEY,
  teachDirectorySchema,
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

import { DEFAULT_LOCALE, localeFromFormData, studioMessages, translate, type Locale } from "@/lib/i18n";
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

const CREATE_DEDUPE_WINDOW_MS = 60_000;

/**
 * Create New Space -> Time to Teach. Creates the tenant immediately (the
 * slot trigger, enforce_space_slot_capacity() in 0017, is the real capacity
 * check) with calm defaults, then opens the Teach Studio.
 */
export async function createTeachSpace(): Promise<void> {
  const { supabase, user } = await requireUser();
  if (!user) redirect("/log-in");

  // Idempotency: a double click, a slow-network retry or a second tab must not
  // mint a second Space. If this user created a still-untouched Teach Space a
  // moment ago, open that one instead. A genuine second Space (or any Space the
  // owner has renamed) is unaffected. Key: same user + Teach + still-untitled name
  // + created in the last 60s. Known limit: this is a read-then-insert, so two truly
  // simultaneous requests (e.g. two tabs in the same instant) can both miss it; the
  // slot trigger still bounds the damage. A durable request key is the real fix.
  const { data: recent } = await supabase
    .from("tenants")
    .select("id")
    .eq("product_type", TEACH_PRODUCT_TYPE)
    .eq("created_by", user.id)
    .eq("name", SPACE_TYPES.teach.copy.untitledName)
    .gte("created_at", new Date(Date.now() - CREATE_DEDUPE_WINDOW_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recent) redirect(`/configurator/teach/${recent.id}`);

  const { data: tenant, error } = await supabase
    .from("tenants")
    .insert({ name: SPACE_TYPES.teach.copy.untitledName, product_type: TEACH_PRODUCT_TYPE, timezone: DEFAULT_TIMEZONE })
    .select("id")
    .single();
  if (error || !tenant) {
    redirect(error?.hint === "SLOT_LIMIT_REACHED" ? "/create?error=slots" : "/create?error=create");
  }

  // Independent draft defaults, written together so the redirect is not held up
  // by three sequential round trips.
  await Promise.all([
    supabase.from("brand_configs").upsert({
      tenant_id: tenant.id,
      name: SPACE_TYPES.teach.copy.untitledName,
      custom_primary: DEFAULT_TEACH_PRESET.primary,
      custom_secondary: DEFAULT_TEACH_PRESET.accent,
      custom_navigation: DEFAULT_TEACH_PRESET.navigation,
      custom_text: DEFAULT_TEACH_PRESET.text,
      updated_at: new Date().toISOString(),
    }),
    supabase.from("module_settings").upsert({
      tenant_id: tenant.id,
      module_key: "teachStyle",
      data: TEACH_SETTINGS_SCHEMAS.teachStyle.parse({ preset: DEFAULT_TEACH_PRESET.key, background: DEFAULT_TEACH_PRESET.surface }),
    }),
    supabase.from("module_configs").upsert(
      ["teachReadings", "teachAudio", "teachContact"].map((module_key) => ({ tenant_id: tenant.id, module_key, enabled: true })),
      { onConflict: "tenant_id,module_key" }
    ),
  ]);

  redirect(`/configurator/teach/${tenant.id}`);
}

// ---------------------------------------------------------------------------
// Identity & brand colours
// ---------------------------------------------------------------------------

/** A factory, not a constant: the validation message is localized, and a
 * module-level schema would freeze it to whichever locale loaded first. */
const identitySchema = (locale: Locale) =>
  z.object({
    name: z.string().trim().min(1, translate(locale, "studio", "pleaseAddName")).max(80),
    timezone: z.string().min(1).max(64),
  });

export async function saveTeachIdentity(tenantId: string, input: { name: string; timezone: string },
  locale: Locale = DEFAULT_LOCALE
): Promise<TeachActionState> {
  const t = studioMessages(locale);
  const { supabase, user } = await requireUser();
  if (!user) return { error: t("notLoggedInToSave") };
  if (!(await requireTeachTenant(supabase, tenantId))) return { error: t("spaceNotFound") };
  const parsed = identitySchema(locale).safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? t("pleaseCheckDetails") };
  const valid = (() => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: parsed.data.timezone });
      return true;
    } catch {
      return false;
    }
  })();
  if (!valid) return { error: t("timezoneNotRecognised") };

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
  input: { primary: string; accent: string; navigation: string | null; text: string | null },
  locale: Locale = DEFAULT_LOCALE
): Promise<TeachActionState> {
  const t = studioMessages(locale);
  const { supabase, user } = await requireUser();
  if (!user) return { error: t("notLoggedInToSave") };
  if (!(await requireTeachTenant(supabase, tenantId))) return { error: t("spaceNotFound") };
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

export async function saveTeachSettings(tenantId: string, key: TeachSettingsKey, data: unknown,
  locale: Locale = DEFAULT_LOCALE
): Promise<TeachActionState> {
  const t = studioMessages(locale);
  const { supabase, user } = await requireUser();
  if (!user) return { error: t("notLoggedInToSave") };
  if (!(TEACH_SETTINGS_KEYS as readonly string[]).includes(key)) return { error: t("unknownSection") };
  if (!(await requireTeachTenant(supabase, tenantId))) return { error: t("spaceNotFound") };

  const parsed = (TEACH_SETTINGS_SCHEMAS[key] as z.ZodTypeAny).safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? t("someDetailsInvalid") };
  // Any media reference must be one of this tenant's own draft objects.
  for (const ref of collectTeachMediaRefs(parsed.data)) {
    if (!isTenantMediaRef(tenantId, ref)) return { error: t("imageRefInvalidReupload") };
  }

  // The refs this row points at BEFORE the save: the only candidates for
  // cleanup afterwards. A failed read just means nothing is cleaned up.
  const { data: previous } = await supabase
    .from("module_settings")
    .select("data")
    .eq("tenant_id", tenantId)
    .eq("module_key", key)
    .maybeSingle();

  const { error } = await supabase
    .from("module_settings")
    .upsert(
      { tenant_id: tenantId, module_key: key, data: parsed.data, updated_at: new Date().toISOString() },
      { onConflict: "tenant_id,module_key" }
    );
  if (error) return { error: error.message };

  await removeReplacedSettingsImages(supabase, tenantId, collectTeachMediaRefs(previous?.data), collectTeachMediaRefs(parsed.data));
  return OK;
}

/** Explicit, owner-only directory opt-in. Private row; never part of the published snapshot. */
export async function saveTeachDirectoryListing(tenantId: string, listed: boolean,
  locale: Locale = DEFAULT_LOCALE
): Promise<TeachActionState> {
  const t = studioMessages(locale);
  const { supabase, user } = await requireUser();
  if (!user) return { error: t("notLoggedInToSave") };
  if (!(await requireTeachTenant(supabase, tenantId))) return { error: t("spaceNotFound") };
  const data = teachDirectorySchema.parse({ listed: listed === true });
  const { error } = await supabase
    .from("module_settings")
    .upsert({ tenant_id: tenantId, module_key: TEACH_DIRECTORY_KEY, data, updated_at: new Date().toISOString() }, { onConflict: "tenant_id,module_key" });
  if (error) return { error: error.message };
  return OK;
}

/**
 * Every media ref the tenant's saved DRAFT state points at right now, across
 * ALL rows that can hold one (settings singletons, item images and audio,
 * brand images, Explore module covers). Returns null when any read fails, so
 * the caller can fail closed: an unprovable "nobody references this" never
 * deletes anything.
 */
async function currentDraftRefs(supabase: SupabaseClient, tenantId: string): Promise<Set<string> | null> {
  const [settings, items, brand, configs] = await Promise.all([
    supabase.from("module_settings").select("data").eq("tenant_id", tenantId),
    supabase.from("module_items").select("image_ref, metadata").eq("tenant_id", tenantId),
    supabase.from("brand_configs").select("hero_image_ref, space_image_ref, logo_ref").eq("tenant_id", tenantId),
    supabase.from("module_configs").select("image_ref").eq("tenant_id", tenantId),
  ]);
  if (settings.error || items.error || brand.error || configs.error) return null;
  const refs = new Set<string>();
  const add = (v: unknown) => {
    if (typeof v === "string" && v) refs.add(v);
  };
  for (const row of settings.data ?? []) collectTeachMediaRefs(row.data).forEach(add);
  for (const row of items.data ?? []) {
    add(row.image_ref);
    collectTeachMediaRefs(row.metadata).forEach(add);
  }
  for (const row of brand.data ?? []) {
    add(row.hero_image_ref);
    add(row.space_image_ref);
    add(row.logo_ref);
  }
  for (const row of configs.data ?? []) add(row.image_ref);
  return refs;
}

/**
 * After a settings save COMMITS, removes the draft images that save stopped
 * referencing (Remove, or Replace with a new upload) - and only those that
 * nothing else in the Space's saved state references. The invariant is that a
 * persisted media object is never deleted while any saved row still points at
 * it: nothing is deleted before the save succeeds (the Studio's Remove button
 * only changes the form), and if the "no other reference" proof cannot be
 * completed the object is kept for later orphan cleanup. Published copies are
 * never touched here and audio refs are excluded (detachTeachAudio owns them).
 * Best-effort: a failure leaves an unreferenced draft behind and never
 * affects the already-saved settings.
 */
async function removeReplacedSettingsImages(
  supabase: SupabaseClient,
  tenantId: string,
  previousRefs: string[],
  savedRefs: string[]
): Promise<void> {
  const kept = new Set(savedRefs);
  const candidates = [...new Set(previousRefs)].filter(
    (ref) => !kept.has(ref) && isDraftMediaPathForTenant(tenantId, ref) && ref.split("/")[1] !== TEACH_AUDIO_FOLDER_KEY
  );
  if (candidates.length === 0) return;
  try {
    const referenced = await currentDraftRefs(supabase, tenantId);
    if (!referenced) return;
    await removeDraftObjects(supabase, tenantId, candidates.filter((ref) => !referenced.has(ref)));
  } catch (error) {
    console.error("saveTeachSettings: replaced image cleanup failed", error instanceof Error ? error.message : error);
  }
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
  items: unknown,
  locale: Locale = DEFAULT_LOCALE
): Promise<TeachActionState> {
  const t = studioMessages(locale);
  const { supabase, user } = await requireUser();
  if (!user) return { error: t("notLoggedInToSave") };
  if (!TEACH_EDITABLE_ITEM_KEYS.includes(moduleKey)) return { error: t("unknownSection") };
  const tenant = await loadTeachTenant(supabase, tenantId);
  if (!tenant) return { error: t("spaceNotFound") };
  if (!Array.isArray(items)) return { error: t("couldNotReadList") };
  const warnings: string[] = [];

  if (moduleKey === "customPages") {
    const entitlement = await getSpaceEntitlement(supabase, tenantId);
    const limit = getCustomPagesLimit(entitlement);
    if (items.length > limit) return { error: t("pageLimitPlan", { limit }) };
  }

  const schema = teachItemFieldsSchema(moduleKey);
  const rows = [];
  for (const [index, raw] of items.entries()) {
    const id = (raw as { id?: unknown })?.id;
    if (typeof id !== "string" || !z.string().uuid().safeParse(id).success) return { error: t("couldNotReadList") };
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? t("someDetailsInvalid") };
    const audioRef = (parsed.data.metadata as { audioRef?: string | null }).audioRef;
    if (audioRef) {
      const parts = parseAudioDraftRef(audioRef);
      if (!parts || parts.tenantId !== tenantId || parts.moduleKey !== TEACH_AUDIO_FOLDER_KEY || parts.itemId !== id) {
        return { error: t("audioRefInvalidReupload") };
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
        return { error: t("tooManyExceptions", { title: parsed.data.title }) };
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
        return { error: t("recurrenceTooLarge", { title: parsed.data.title }) };
      }
      metadata = { ...(times.metadata as unknown as Record<string, unknown>), recurrence: recurrenceOut, exceptions: exceptionsOut, occurrence: null };
      for (const w of times.warnings) warnings.push(`“${parsed.data.title}”: ${w.message}`);
    }
    rows.push({
      id,
      tenant_id: tenantId,
      module_key: moduleKey,
      // Optional-title kinds (gallery captions, availability labels) keep an
      // empty title so guests see the intended default, never t("untitled").
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
export async function deleteTeachItem(tenantId: string, moduleKey: TeachEditableItemKey, itemId: string,
  locale: Locale = DEFAULT_LOCALE
): Promise<TeachActionState> {
  const t = studioMessages(locale);
  const { supabase, user } = await requireUser();
  if (!user) return { error: t("notLoggedIn") };
  if (!TEACH_EDITABLE_ITEM_KEYS.includes(moduleKey)) return { error: t("unknownSection") };
  if (!(await requireTeachTenant(supabase, tenantId))) return { error: t("spaceNotFound") };
  if (!z.string().uuid().safeParse(itemId).success) return { error: t("missingItem") };
  const staleRefs = await itemDraftRefs(supabase, tenantId, [itemId]);
  const { error } = await supabase.from("module_items").delete().eq("id", itemId).eq("tenant_id", tenantId);
  if (error) return { error: error.message };
  await removeDraftObjects(supabase, tenantId, staleRefs);
  return OK;
}

// ---------------------------------------------------------------------------
// Explore modules (module_configs)
// ---------------------------------------------------------------------------

export async function saveTeachModules(tenantId: string, enabled: string[],
  locale: Locale = DEFAULT_LOCALE
): Promise<TeachActionState> {
  const t = studioMessages(locale);
  const { supabase, user } = await requireUser();
  if (!user) return { error: t("notLoggedInToSave") };
  if (!(await requireTeachTenant(supabase, tenantId))) return { error: t("spaceNotFound") };
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
  const t = studioMessages(localeFromFormData(formData));
  const fail = (error: string): TeachUploadState => ({ error, imageRef: null, imageUrl: null });
  const { supabase, user } = await requireUser();
  if (!user) return fail(t("notLoggedIn"));
  const tenantId = String(formData.get("tenantId") ?? "");
  const key = String(formData.get("settingsKey") ?? "");
  const slot = String(formData.get("slot") ?? "");
  const file = formData.get("file");
  if (!SETTINGS_IMAGE_SLOTS[key]?.includes(slot)) return fail(t("unknownImageSlot"));
  if (!(await requireTeachTenant(supabase, tenantId))) return fail(t("spaceNotFound"));
  if (!(file instanceof File) || file.size === 0) return fail(t("noFileSelected"));
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return fail(t("unsupportedImage"));
  if (!isFileSizeAllowed(file.size)) return fail(t("imageTooLarge"));

  let optimized: Buffer;
  try {
    optimized = await optimizeImageToWebp(file);
  } catch {
    return fail(t("imageNotProcessed"));
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
  sizeBytes: number,
  locale: Locale = DEFAULT_LOCALE
): Promise<TeachAudioUploadState> {
  const t = studioMessages(locale);
  const fail = (error: string): TeachAudioUploadState => ({ error, path: null });
  const { supabase, user } = await requireUser();
  if (!user) return fail(t("notLoggedIn"));
  if (!(await requireTeachTenant(supabase, tenantId))) return fail(t("spaceNotFound"));
  const itemId = (item as { id?: unknown } | null)?.id;
  if (typeof itemId !== "string" || !z.string().uuid().safeParse(itemId).success) return fail(t("missingItem"));
  const ext = typeof mimeType === "string" ? AUDIO_ALLOWED_TYPES[normalizeMimeType(mimeType)] : undefined;
  if (!ext) return fail(t("unsupportedAudio"));
  if (!isAudioSizeAllowed(sizeBytes)) return fail(t("audioTooLarge", { limit: MAX_AUDIO_BYTES / (1024 * 1024) }));

  const existing = await loadTeachItemRow(supabase, tenantId, itemId);
  if (existing && existing.module_key !== "teachAudio") return fail(t("missingItem"));
  if (!existing) {
    const raw = item as Record<string, unknown>;
    const parsed = teachItemFieldsSchema("teachAudio").safeParse({ ...raw, title: String(raw.title ?? "").trim() || t("untitledAudio") });
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? t("someDetailsInvalid"));
    const { error } = await supabase.from("module_items").insert({
      id: itemId,
      tenant_id: tenantId,
      module_key: "teachAudio",
      title: parsed.data.title ?? t("untitledAudio"),
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

export async function attachTeachAudio(tenantId: string, itemId: string, ref: string, durationSeconds: number | null,
  locale: Locale = DEFAULT_LOCALE
): Promise<TeachActionState> {
  const t = studioMessages(locale);
  const { supabase, user } = await requireUser();
  if (!user) return { error: t("notLoggedIn") };
  if (!(await requireTeachTenant(supabase, tenantId))) return { error: t("spaceNotFound") };
  if (!z.string().uuid().safeParse(itemId).success) return { error: t("missingItem") };
  const parts = typeof ref === "string" ? parseAudioDraftRef(ref) : null;
  if (!parts || parts.tenantId !== tenantId || parts.moduleKey !== TEACH_AUDIO_FOLDER_KEY || parts.itemId !== itemId) {
    return { error: t("audioRefInvalid") };
  }
  const row = await loadTeachItemRow(supabase, tenantId, itemId);
  if (!row || row.module_key !== "teachAudio") return { error: t("missingItem") };
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
  if (infoError || !info) return { error: t("uploadDidNotFinish") };
  if (!isAudioSizeAllowed(Number(info.size))) return reject(t("audioTooLarge", { limit: MAX_AUDIO_BYTES / (1024 * 1024) }));
  if (AUDIO_ALLOWED_TYPES[normalizeMimeType(String(info.contentType ?? ""))] !== parts.ext) {
    return reject(t("unsupportedAudio"));
  }

  if (ref !== previousRef) {
    // A published object already living in this upload's folder is never a
    // fresh upload; refuse to adopt the folder rather than risk replacing
    // what the live snapshot may reference.
    const published = versionedMediaPath("published", { ...parts });
    const { data: publishedExists } = await bucket.exists(published);
    if (publishedExists) return { error: t("audioRefInvalidReupload") };
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

export async function detachTeachAudio(tenantId: string, itemId: string,
  locale: Locale = DEFAULT_LOCALE
): Promise<TeachActionState> {
  const t = studioMessages(locale);
  const { supabase, user } = await requireUser();
  if (!user) return { error: t("notLoggedIn") };
  if (!(await requireTeachTenant(supabase, tenantId))) return { error: t("spaceNotFound") };
  if (!z.string().uuid().safeParse(itemId).success) return { error: t("missingItem") };
  const row = await loadTeachItemRow(supabase, tenantId, itemId);
  if (!row) return OK;
  if (row.module_key !== "teachAudio") return { error: t("missingItem") };
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
export async function publishTeachSpace(tenantId: string,
  locale: Locale = DEFAULT_LOCALE
): Promise<TeachPublishState> {
  const t = studioMessages(locale);
  const { supabase, user } = await requireUser();
  if (!user) return { error: t("notLoggedIn"), publishedAt: null };
  if (!(await requireTeachTenant(supabase, tenantId))) return { error: t("spaceNotFound"), publishedAt: null };

  const publishGate = getPublishAvailability(TEACH_PRODUCT_TYPE);
  if (!publishGate.available) return { error: publishGate.message, publishedAt: null };

  const availability = deriveCommercialAvailability(await getSpaceEntitlement(supabase, tenantId));
  if (!availability.canPublish) {
    return { error: t("needsActiveAccess"), publishedAt: null };
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
      error: err instanceof Error ? t("couldNotPublishMediaWhy", { reason: err.message }) : t("couldNotPublishMedia"),
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
