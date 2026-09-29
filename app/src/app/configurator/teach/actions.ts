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
  tenantMediaPath,
  mediaItemFolder,
} from "@/lib/media/path";
import { copyDraftToPublished } from "@/lib/media/publish";
import { optimizeImageToWebp } from "@/lib/media/optimizeImage";
import {
  AUDIO_MIME_BY_EXTENSION,
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
} from "@/lib/teach/schemas";
import { DEFAULT_TEACH_PRESET } from "@/lib/teach/style";

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

export type TeachActionState = { error: string | null };
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
  if (!z.string().uuid().safeParse(tenantId).success) return false;
  const { data } = await supabase.from("tenants").select("product_type").eq("id", tenantId).maybeSingle();
  return data?.product_type === TEACH_PRODUCT_TYPE;
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
    .insert({ name: "My Teaching Space", product_type: TEACH_PRODUCT_TYPE, timezone: DEFAULT_TIMEZONE })
    .select("id")
    .single();
  if (error || !tenant) {
    redirect(error?.hint === "SLOT_LIMIT_REACHED" ? "/create?error=slots" : "/create?error=create");
  }

  await supabase.from("brand_configs").upsert({
    tenant_id: tenant.id,
    name: "My Teaching Space",
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

async function removeFolder(supabase: SupabaseClient, folder: string) {
  const { data: siblings } = await supabase.storage.from(MEDIA_BUCKET).list(folder);
  const toRemove = (siblings ?? []).map((f) => `${folder}/${f.name}`);
  if (toRemove.length > 0) await supabase.storage.from(MEDIA_BUCKET).remove(toRemove);
}

async function removeItemMedia(supabase: SupabaseClient, tenantId: string, moduleKey: string, itemId: string) {
  await removeFolder(supabase, `${tenantId}/${moduleKey}/${itemId}`);
  if (moduleKey === "teachAudio") await removeFolder(supabase, `${tenantId}/${TEACH_AUDIO_FOLDER_KEY}/${itemId}`);
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
  if (!(await requireTeachTenant(supabase, tenantId))) return { error: "Space not found." };
  if (!Array.isArray(items)) return { error: "Could not read the list." };

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
    if (audioRef && !audioRef.startsWith(`${tenantId}/${TEACH_AUDIO_FOLDER_KEY}/${id}/draft.`)) {
      return { error: "An audio file reference wasn't valid - please re-upload it." };
    }
    if (audioRef && !isTenantMediaRef(tenantId, audioRef)) return { error: "An audio file reference wasn't valid." };
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
      metadata: parsed.data.metadata as Record<string, unknown>,
    });
  }

  const incoming = new Set(rows.map((r) => r.id));
  const { data: existing } = await supabase
    .from("module_items")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("module_key", moduleKey);
  const removed = (existing ?? []).filter((r) => !incoming.has(r.id)).map((r) => r.id);
  for (const id of removed) await removeItemMedia(supabase, tenantId, moduleKey, id);
  if (removed.length > 0) {
    const { error } = await supabase.from("module_items").delete().eq("tenant_id", tenantId).in("id", removed);
    if (error) return { error: error.message };
  }
  if (rows.length > 0) {
    const { error } = await supabase.from("module_items").upsert(rows, { onConflict: "id" });
    if (error) return { error: error.message };
  }
  return OK;
}

/** Removes one item immediately (row + its image and audio folders). */
export async function deleteTeachItem(tenantId: string, moduleKey: TeachEditableItemKey, itemId: string): Promise<TeachActionState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You need to be logged in." };
  if (!TEACH_EDITABLE_ITEM_KEYS.includes(moduleKey)) return { error: "Unknown section." };
  if (!(await requireTeachTenant(supabase, tenantId))) return { error: "Space not found." };
  if (!z.string().uuid().safeParse(itemId).success) return { error: "Missing item." };
  await removeItemMedia(supabase, tenantId, moduleKey, itemId);
  const { error } = await supabase.from("module_items").delete().eq("id", itemId).eq("tenant_id", tenantId);
  if (error) return { error: error.message };
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
  const path = tenantMediaPath(tenantId, key, slot, OPTIMIZED_IMAGE_EXTENSION);
  const { error: uploadError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, optimized, { upsert: true, contentType: OPTIMIZED_IMAGE_MIME });
  if (uploadError) return fail(uploadError.message);
  const { data: signed } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path, 3600);
  return { error: null, imageRef: path, imageUrl: signed?.signedUrl ?? null };
}

/** Deletes one of this tenant's own draft media objects (settings image or audio file). */
export async function removeTeachDraftMedia(tenantId: string, ref: string): Promise<TeachActionState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You need to be logged in." };
  if (!(await requireTeachTenant(supabase, tenantId))) return { error: "Space not found." };
  if (!isTenantMediaRef(tenantId, ref)) return { error: "Unknown media." };
  const { error } = await supabase.storage.from(MEDIA_BUCKET).remove([ref]);
  if (error) return { error: error.message };
  return OK;
}

// ---------------------------------------------------------------------------
// Publish
// ---------------------------------------------------------------------------

export type TeachPublishState = { error: string | null; publishedAt: string | null };

/**
 * Snapshot every current draft media object (item images, audio, primary
 * image, settings images) into its published path, THEN call the shared
 * publish_space() RPC - which enforces commercial access and, for Teach
 * tenants only, adds modules.teach (migration 0019). Same ordering and
 * failure rule as Time to Flow's publishSpace: any media failure stops
 * before the RPC, so a "successful" publish can never point at stale media.
 */
export async function publishTeachSpace(tenantId: string): Promise<TeachPublishState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You need to be logged in.", publishedAt: null };
  if (!(await requireTeachTenant(supabase, tenantId))) return { error: "Space not found.", publishedAt: null };

  const availability = deriveCommercialAvailability(await getSpaceEntitlement(supabase, tenantId));
  if (!availability.canPublish) {
    return { error: "This Space needs active access before it can be published.", publishedAt: null };
  }

  const [{ data: itemRows }, { data: brandRow }, { data: settingsRows }] = await Promise.all([
    supabase
      .from("module_items")
      .select("id, module_key, image_ref, metadata")
      .eq("tenant_id", tenantId)
      .in("module_key", TEACH_MEDIA_ITEM_KEYS as string[]),
    supabase.from("brand_configs").select("hero_image_ref").eq("tenant_id", tenantId).maybeSingle(),
    supabase.from("module_settings").select("module_key, data").eq("tenant_id", tenantId).in("module_key", Object.keys(SETTINGS_IMAGE_SLOTS)),
  ]);

  const settingsByKey = new Map((settingsRows ?? []).map((r) => [r.module_key as string, r.data as Record<string, unknown>]));
  const slotRef = (key: string, slot: string): string | null => {
    const data = settingsByKey.get(key) ?? {};
    const node = key === "teachExplore" ? (data.cards as Record<string, unknown> | undefined)?.[slot] : data[slot];
    const ref = (node as { imageRef?: unknown } | undefined)?.imageRef;
    return typeof ref === "string" && isTenantMediaRef(tenantId, ref) ? ref : null;
  };

  const jobs: Promise<void>[] = [copyDraftToPublished(supabase, brandRow?.hero_image_ref ?? null, `${tenantId}/brand/hero`)];
  for (const row of itemRows ?? []) {
    const imageRef = typeof row.image_ref === "string" && mediaItemFolder(row.image_ref) ? row.image_ref : null;
    jobs.push(copyDraftToPublished(supabase, imageRef, `${tenantId}/${row.module_key}/${row.id}`));
    if (row.module_key === "teachAudio") {
      const audioRef = (row.metadata as { audioRef?: unknown } | null)?.audioRef;
      const ref = typeof audioRef === "string" && isTenantMediaRef(tenantId, audioRef) ? audioRef : null;
      const ext = ref?.split(".").pop() ?? "";
      jobs.push(
        copyDraftToPublished(supabase, ref, `${tenantId}/${TEACH_AUDIO_FOLDER_KEY}/${row.id}`, AUDIO_MIME_BY_EXTENSION[ext] ?? "audio/mpeg")
      );
    }
  }
  for (const [key, slots] of Object.entries(SETTINGS_IMAGE_SLOTS)) {
    for (const slot of slots) jobs.push(copyDraftToPublished(supabase, slotRef(key, slot), `${tenantId}/${key}/${slot}`));
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
  return { error: null, publishedAt: data as string };
}
