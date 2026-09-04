"use server";

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { brandConfigSchema } from "@/lib/theme/tokens";
import { publicScheduleItemSchema } from "@/lib/schedule/types";
import { facilitatorSchema } from "@/lib/modules/facilitator";
import { mealSchema } from "@/lib/modules/meal";
import { treatmentSchema } from "@/lib/modules/treatment";
import { facilitySchema } from "@/lib/modules/facility";
import { arrivalInfoSchema } from "@/lib/modules/arrival";
import { IMPLEMENTED_OPTIONAL_MODULES, type OptionalModuleKey } from "@/lib/modules/catalog";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";
import {
  MEDIA_BUCKET,
  MAX_IMAGE_BYTES,
  ALLOWED_IMAGE_TYPES,
  extensionForMimeType,
  tenantMediaPath,
  publishedMediaPath,
  mediaItemFolder,
} from "@/lib/media/path";

export type SaveDraftState = {
  error: string | null;
  tenantId: string | null;
};

/**
 * Creates the tenant on first save (empty tenantId field) and upserts its
 * brand config on every save. This is real persistence, scoped by RLS to
 * the signed-in user - not a local-storage stand-in.
 */
export async function saveDraft(
  prevState: SaveDraftState,
  formData: FormData
): Promise<SaveDraftState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be logged in to save.", tenantId: null };

  let tenantId = String(formData.get("tenantId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? DEFAULT_TIMEZONE);

  if (!tenantId) {
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .insert({ name: name || "Untitled Retreat", product_type: "retreat", timezone })
      .select("id")
      .single();
    if (tenantError || !tenant) {
      return { error: tenantError?.message ?? "Could not create your space.", tenantId: null };
    }
    tenantId = tenant.id;
  } else {
    await supabase
      .from("tenants")
      .update({ name: name || "Untitled Retreat", timezone })
      .eq("id", tenantId);
  }

  const parsed = brandConfigSchema.safeParse({
    name,
    logoUrl: null,
    palette: String(formData.get("palette") ?? "forest-sage"),
    customPrimary: null,
    atmosphere: String(formData.get("atmosphere") ?? "calm-organic"),
    imageStyle: "rounded",
  });
  if (!parsed.success) {
    return { error: "Some brand details weren't valid.", tenantId };
  }

  const { error: brandError } = await supabase.from("brand_configs").upsert({
    tenant_id: tenantId,
    name: parsed.data.name,
    palette: parsed.data.palette,
    atmosphere: parsed.data.atmosphere,
    image_style: parsed.data.imageStyle,
    updated_at: new Date().toISOString(),
  });
  if (brandError) return { error: brandError.message, tenantId };

  return { error: null, tenantId };
}

export type SaveScheduleState = { error: string | null };

/**
 * Replace-all: the simplest correct approach for an MVP schedule editor -
 * deletes the tenant's existing schedule_items and inserts the submitted
 * set. RLS (member-scoped) is what actually stops this from touching
 * another tenant's schedule, not anything in this function's own logic.
 */
export async function saveSchedule(
  _prevState: SaveScheduleState,
  formData: FormData
): Promise<SaveScheduleState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be logged in to save." };

  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) return { error: "Missing space." };

  let items: unknown;
  try {
    items = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    return { error: "Could not read the schedule." };
  }

  const parsed = z.array(publicScheduleItemSchema).safeParse(items);
  if (!parsed.success) return { error: "Some schedule details weren't valid." };

  const { error: deleteError } = await supabase
    .from("schedule_items")
    .delete()
    .eq("tenant_id", tenantId);
  if (deleteError) return { error: deleteError.message };

  if (parsed.data.length > 0) {
    const { error: insertError } = await supabase.from("schedule_items").insert(
      parsed.data.map((item) => ({
        tenant_id: tenantId,
        date: item.date,
        start_time: item.startTime,
        end_time: item.endTime,
        title: item.title,
        facilitator: item.facilitator,
        location: item.location,
        description: item.description,
        category: item.category,
      }))
    );
    if (insertError) return { error: insertError.message };
  }

  return { error: null };
}

export type SaveModulesState = { error: string | null };

/**
 * Enable/disable is a small, bounded set (the implemented catalog), so a
 * straightforward upsert-per-key is clearer here than a replace-all.
 */
export async function saveModules(
  _prevState: SaveModulesState,
  formData: FormData
): Promise<SaveModulesState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be logged in to save." };

  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) return { error: "Missing space." };

  const rows = IMPLEMENTED_OPTIONAL_MODULES.map((key) => ({
    tenant_id: tenantId,
    module_key: key,
    enabled: formData.get(`module_${key}`) === "on",
  }));

  const { error } = await supabase.from("module_configs").upsert(rows, { onConflict: "tenant_id,module_key" });
  if (error) return { error: error.message };

  return { error: null };
}

// ---------------------------------------------------------------------
// Shared module_items persistence (Facilitators, Meals, Treatments,
// Facilities) - one generic upsert-by-id implementation, reused by each
// module's own thin, schema-validated entry point below. Each module
// still gets its own exported action and its own zod schema (see
// lib/modules/*.ts) - this only factors out the identical mechanics, not
// the validation contract.
//
// Every item's id is assigned exactly once, client-side, the moment the
// item is created (see blankX() in each step component and
// createModuleItemStub below) and never reassigned by anything - not by
// Save, not by an upload, not by a reload. That single invariant is what
// makes "one configurator item = one stable database row identity" true
// by construction: there is no operation anywhere in this module that
// ever hands an existing logical item a different id, so there is no
// moment where two different ids could refer to the same item and no
// race to avoid. Save's job is only to upsert the rows currently on
// screen and delete the ones that genuinely aren't there anymore.
//
// Save also never writes image_ref - that column is exclusively owned by
// uploadModuleItemPhoto/removeModuleItemPhoto/createModuleItemStub. This
// isn't optional: Save's payload is a snapshot of client state at click
// time, and if an upload's server round-trip completes AFTER that
// snapshot was taken but BEFORE Save's own write reaches the database,
// Save's write would otherwise silently revert image_ref to whatever the
// (now-stale) snapshot believed it was - a real duplicate-column-
// ownership race found during adversarial verification, distinct from
// the id race above. Two actions can't race over a column neither of
// them writes: Save omits image_ref from its upsert entirely, so there's
// no state for it to be stale about.
// ---------------------------------------------------------------------

export type SaveModuleItemsState = { error: string | null };

// Deliberately no image_ref here - see saveModuleItemsGeneric's own
// comment on why Save must never write that column.
type ModuleItemUpsert = {
  id: string;
  tenant_id: string;
  module_key: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  sort_order: number;
  metadata: Record<string, unknown>;
};

async function saveModuleItemsGeneric(
  supabase: SupabaseClient,
  tenantId: string,
  moduleKey: string,
  rows: ModuleItemUpsert[]
): Promise<SaveModuleItemsState> {
  const incomingIds = new Set(rows.map((r) => r.id));

  // Rows that exist in the database but aren't in this submission are
  // genuinely gone, not just edited - their media (if any) needs the same
  // cleanup an explicit Remove would do (see deleteModuleItem, which this
  // mirrors), and the row itself needs deleting. Everything else (kept or
  // brand-new) is a plain upsert by id below - never a delete+reinsert,
  // so an id that already exists is always updated in place, never
  // replaced by a new one.
  const { data: existingRows } = await supabase
    .from("module_items")
    .select("id, image_ref")
    .eq("tenant_id", tenantId)
    .eq("module_key", moduleKey);
  const removedRows = (existingRows ?? []).filter((r) => !incomingIds.has(r.id));

  for (const row of removedRows) {
    if (!row.image_ref) continue;
    const folder = mediaItemFolder(row.image_ref);
    if (folder) {
      const { data: siblings } = await supabase.storage.from(MEDIA_BUCKET).list(folder);
      const toRemove = (siblings ?? []).map((f) => `${folder}/${f.name}`);
      if (toRemove.length > 0) await supabase.storage.from(MEDIA_BUCKET).remove(toRemove);
    } else {
      await supabase.storage.from(MEDIA_BUCKET).remove([row.image_ref]);
    }
  }
  if (removedRows.length > 0) {
    const { error: deleteError } = await supabase
      .from("module_items")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("module_key", moduleKey)
      .in(
        "id",
        removedRows.map((r) => r.id)
      );
    if (deleteError) return { error: deleteError.message };
  }

  if (rows.length > 0) {
    const { error: upsertError } = await supabase.from("module_items").upsert(rows, { onConflict: "id" });
    if (upsertError) return { error: upsertError.message };
  }

  return { error: null };
}

/**
 * Validates each item's own fields against its module's zod schema
 * (never freeform) while separately carrying through the client-assigned
 * id each item already has - the schemas themselves deliberately don't
 * include id (it's an internal identity concern, not published/guest-
 * facing content), so it's threaded through positionally instead.
 */
function parseItemsWithIds<T>(
  formData: FormData,
  schema: z.ZodType<T>
): { data: (T & { id: string })[] } | { error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    return { error: "Could not read the list." };
  }
  if (!Array.isArray(raw)) return { error: "Could not read the list." };

  const parsed = z.array(schema).safeParse(raw);
  if (!parsed.success) return { error: "Some details weren't valid." };

  const ids = raw.map((r) => (r && typeof r === "object" && "id" in r ? String((r as { id: unknown }).id) : ""));
  if (ids.some((id) => !id)) return { error: "Missing item id." };

  return { data: parsed.data.map((item, i) => ({ ...item, id: ids[i] })) };
}

export type SaveFacilitatorsState = SaveModuleItemsState;

export async function saveFacilitators(
  _prevState: SaveFacilitatorsState,
  formData: FormData
): Promise<SaveFacilitatorsState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be logged in to save." };

  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) return { error: "Missing space." };

  const parsed = parseItemsWithIds(formData, facilitatorSchema);
  if ("error" in parsed) return { error: parsed.error };

  const rows = parsed.data.map((item, i) => ({
    id: item.id,
    tenant_id: tenantId,
    module_key: "facilitators",
    title: item.name,
    subtitle: item.role,
    description: item.bio,
    sort_order: i,
    metadata: {},
  }));
  return saveModuleItemsGeneric(supabase, tenantId, "facilitators", rows);
}

export type SaveMealsState = SaveModuleItemsState;

export async function saveMeals(_prevState: SaveMealsState, formData: FormData): Promise<SaveMealsState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be logged in to save." };

  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) return { error: "Missing space." };

  const parsed = parseItemsWithIds(formData, mealSchema);
  if ("error" in parsed) return { error: parsed.error };

  const rows = parsed.data.map((item, i) => ({
    id: item.id,
    tenant_id: tenantId,
    module_key: "meals",
    title: item.name,
    subtitle: null,
    description: item.description,
    sort_order: i,
    metadata: {
      mealType: item.mealType,
      startTime: item.startTime,
      endTime: item.endTime,
      dietaryTags: item.dietaryTags,
      location: item.location,
    },
  }));
  return saveModuleItemsGeneric(supabase, tenantId, "meals", rows);
}

export type SaveTreatmentsState = SaveModuleItemsState;

export async function saveTreatments(
  _prevState: SaveTreatmentsState,
  formData: FormData
): Promise<SaveTreatmentsState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be logged in to save." };

  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) return { error: "Missing space." };

  const parsed = parseItemsWithIds(formData, treatmentSchema);
  if ("error" in parsed) return { error: parsed.error };

  const rows = parsed.data.map((item, i) => ({
    id: item.id,
    tenant_id: tenantId,
    module_key: "treatments",
    title: item.name,
    subtitle: item.shortDescription,
    description: item.description,
    sort_order: i,
    metadata: {
      durationMinutes: item.durationMinutes,
      provider: item.provider,
      location: item.location,
      bookingInfo: item.bookingInfo,
    },
  }));
  return saveModuleItemsGeneric(supabase, tenantId, "treatments", rows);
}

export type SaveFacilitiesState = SaveModuleItemsState;

export async function saveFacilities(
  _prevState: SaveFacilitiesState,
  formData: FormData
): Promise<SaveFacilitiesState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be logged in to save." };

  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) return { error: "Missing space." };

  const parsed = parseItemsWithIds(formData, facilitySchema);
  if ("error" in parsed) return { error: parsed.error };

  const rows = parsed.data.map((item, i) => ({
    id: item.id,
    tenant_id: tenantId,
    module_key: "facilities",
    title: item.name,
    subtitle: null,
    description: item.description,
    sort_order: i,
    metadata: {
      openingHours: item.openingHours,
      location: item.location,
      importantInfo: item.importantInfo,
    },
  }));
  return saveModuleItemsGeneric(supabase, tenantId, "facilities", rows);
}

export type SaveArrivalInfoState = { error: string | null };

/**
 * Arrival Information is a singleton (one row per tenant, keyed by
 * module_key) - module_settings.data, not module_items. First real use of
 * that table by any editor.
 */
export async function saveArrivalInfo(
  _prevState: SaveArrivalInfoState,
  formData: FormData
): Promise<SaveArrivalInfoState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be logged in to save." };

  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) return { error: "Missing space." };

  let data: unknown;
  try {
    data = JSON.parse(String(formData.get("data") ?? "{}"));
  } catch {
    return { error: "Could not read the arrival information." };
  }
  const parsed = arrivalInfoSchema.safeParse(data);
  if (!parsed.success) return { error: "Some arrival details weren't valid." };

  const { error } = await supabase.from("module_settings").upsert(
    {
      tenant_id: tenantId,
      module_key: "arrivalInfo",
      data: parsed.data,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,module_key" }
  );
  if (error) return { error: error.message };

  return { error: null };
}

// ---------------------------------------------------------------------
// Shared media upload/remove for any module_items-backed module
// (Facilitators, Meals, Treatments, Facilities). One bucket, one path
// convention (see lib/media/path.ts), one upload/remove implementation -
// only the moduleKey and the item's own text fields vary per caller.
// ---------------------------------------------------------------------

export type UploadModuleItemPhotoState = {
  error: string | null;
  imageRef: string | null;
  imageUrl: string | null;
};

/**
 * Uploads (or replaces, via upsert at the same deterministic path) an
 * item's photo. Runs through the ordinary RLS-enforcing server client,
 * never the admin client - the storage policies from migration 0006 are
 * what actually stop this from touching another tenant's files, not this
 * function's own logic (it can't even try: the path is always prefixed
 * with this tenantId, and a non-member's insert/update would be rejected
 * by RLS regardless of what path they attempted).
 *
 * Upserts the module_items row itself (not just an update) so the row
 * exists the moment a photo is attached, even for an item that was never
 * explicitly saved yet - otherwise Preview could show a photo whose row
 * doesn't exist yet, which would silently vanish if the organizer
 * navigated away before clicking Save. This was a real gap found and
 * fixed during the previous slice's verification; upsert closes it for
 * every module that uses this shared action, not just Facilitators.
 */
export async function uploadModuleItemPhoto(
  _prevState: UploadModuleItemPhotoState,
  formData: FormData
): Promise<UploadModuleItemPhotoState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be logged in.", imageRef: null, imageUrl: null };

  const tenantId = String(formData.get("tenantId") ?? "");
  const moduleKey = String(formData.get("moduleKey") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const previousRef = String(formData.get("previousRef") ?? "") || null;
  const title = String(formData.get("title") ?? "").trim();
  const subtitle = formData.get("subtitle") ? String(formData.get("subtitle")) : null;
  const description = formData.get("description") ? String(formData.get("description")) : null;
  const sortOrder = Number(formData.get("sortOrder") ?? 0);
  const file = formData.get("file");
  if (!tenantId || !moduleKey || !itemId) {
    return { error: "Missing space or item.", imageRef: null, imageUrl: null };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { error: "No file selected.", imageRef: null, imageUrl: null };
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { error: "Please upload a JPG, PNG or WEBP image.", imageRef: null, imageUrl: null };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { error: "Image must be under 5MB.", imageRef: null, imageUrl: null };
  }

  const ext = extensionForMimeType(file.type);
  if (!ext) return { error: "Unsupported image type.", imageRef: null, imageUrl: null };

  const path = tenantMediaPath(tenantId, moduleKey, itemId, ext);

  // A different extension than before (e.g. replacing a .png with a .jpg)
  // would otherwise leave the stale object behind at its old path.
  if (previousRef && previousRef !== path) {
    await supabase.storage.from(MEDIA_BUCKET).remove([previousRef]);
  }

  const { error: uploadError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadError) return { error: uploadError.message, imageRef: null, imageUrl: null };

  const { data: signed, error: signError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(path, 3600);
  if (signError || !signed) {
    return { error: signError?.message ?? "Uploaded, but preview failed.", imageRef: path, imageUrl: null };
  }

  await supabase.from("module_items").upsert(
    {
      id: itemId,
      tenant_id: tenantId,
      module_key: moduleKey,
      title: title || "Untitled",
      subtitle,
      description,
      image_ref: path,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
    },
    { onConflict: "id" }
  );

  return { error: null, imageRef: path, imageUrl: signed.signedUrl };
}

export type RemoveModuleItemPhotoState = { error: string | null };

export async function removeModuleItemPhoto(
  _prevState: RemoveModuleItemPhotoState,
  formData: FormData
): Promise<RemoveModuleItemPhotoState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be logged in." };

  const tenantId = String(formData.get("tenantId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const imageRef = String(formData.get("imageRef") ?? "");
  if (!imageRef) return { error: null };

  const { error } = await supabase.storage.from(MEDIA_BUCKET).remove([imageRef]);
  if (error) return { error: error.message };

  if (tenantId && itemId) {
    await supabase.from("module_items").update({ image_ref: null }).eq("id", itemId).eq("tenant_id", tenantId);
  }

  return { error: null };
}

export type ModuleItemStubState = { error: string | null };

/**
 * Persists a brand-new item's existence the moment it's added - not just
 * once a photo is uploaded (uploadModuleItemPhoto, above) or Save is
 * clicked. Closes the one remaining asymmetry in when a module_items row
 * starts existing: before this, a text-only new item was pure client
 * state until Save, while an item with a photo already existed in the
 * database from the moment of upload - an organizer could reasonably
 * believe a text-only item was saved when it wasn't. Full field content
 * (name/description/etc.) still only becomes durable via Save, exactly as
 * before; this only guarantees the row - and therefore its identity -
 * exists from creation onward, for every module_items-backed module.
 */
export async function createModuleItemStub(
  _prevState: ModuleItemStubState,
  formData: FormData
): Promise<ModuleItemStubState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be logged in." };

  const tenantId = String(formData.get("tenantId") ?? "");
  const moduleKey = String(formData.get("moduleKey") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const sortOrder = Number(formData.get("sortOrder") ?? 0);
  if (!tenantId || !moduleKey || !itemId) return { error: "Missing space or item." };

  // ON CONFLICT DO NOTHING (ignoreDuplicates), not DO UPDATE: this call's
  // only job is to guarantee the row exists, never to set its fields -
  // it has no authority over content the organizer may have already typed
  // or a photo already uploaded. A plain upsert would otherwise risk
  // clobbering either if this fire-and-forget call is delayed enough to
  // arrive after a later Save or upload - the same class of stale-write
  // race documented on saveModuleItemsGeneric, closed here the same way:
  // by removing this call's ability to overwrite anything at all once the
  // row exists, rather than trying to time it correctly.
  const { error } = await supabase.from("module_items").upsert(
    {
      id: itemId,
      tenant_id: tenantId,
      module_key: moduleKey,
      title: "Untitled",
      subtitle: null,
      description: null,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
    },
    { onConflict: "id", ignoreDuplicates: true }
  );
  if (error) return { error: error.message };

  return { error: null };
}

export type DeleteModuleItemState = { error: string | null };

/**
 * The symmetric counterpart to createModuleItemStub - removing an item
 * before ever saving must clean up the stub row (and any photo attached
 * to it) rather than leaving an orphan the next Save wouldn't know to
 * delete: Save only replaces rows for items still present in the
 * submitted list, so a since-removed item's row would otherwise persist
 * forever, unreferenced by anything.
 */
export async function deleteModuleItem(
  _prevState: DeleteModuleItemState,
  formData: FormData
): Promise<DeleteModuleItemState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be logged in." };

  const tenantId = String(formData.get("tenantId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  if (!tenantId || !itemId) return { error: "Missing space or item." };

  const { data: row } = await supabase
    .from("module_items")
    .select("image_ref")
    .eq("id", itemId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (row?.image_ref) {
    // The item's own folder is exclusively its own (no other item shares
    // it) - safe to remove entirely: the current draft object plus any
    // published copy(ies), including a stale one left by an earlier
    // extension change.
    const folder = mediaItemFolder(row.image_ref);
    if (folder) {
      const { data: siblings } = await supabase.storage.from(MEDIA_BUCKET).list(folder);
      const toRemove = (siblings ?? []).map((f) => `${folder}/${f.name}`);
      if (toRemove.length > 0) await supabase.storage.from(MEDIA_BUCKET).remove(toRemove);
    } else {
      await supabase.storage.from(MEDIA_BUCKET).remove([row.image_ref]);
    }
  }

  const { error } = await supabase.from("module_items").delete().eq("id", itemId).eq("tenant_id", tenantId);
  if (error) return { error: error.message };

  return { error: null };
}

export type PublishState = { error: string | null; publishedAt: string | null };

const MEDIA_MODULE_KEYS = ["facilitators", "meals", "treatments", "facilities"];

/**
 * The only way anything reaches published_spaces. Calls the
 * publish_space(uuid) database function - one atomic transaction, running
 * as the signed-in owner through the normal RLS-enforcing client, never
 * the admin client. A non-owner's call fails inside the same transaction
 * (RLS on the underlying tables/insert), nothing partially applies either way.
 *
 * Before calling it, snapshot every module_items row's current draft photo
 * (across every image-bearing module, not just Facilitators) into its
 * stable published-path counterpart (see publishedMediaPath). This is the
 * media equivalent of what publish_space() already does for text: take a
 * copy of the current draft state, not a live reference to it, so further
 * draft edits/replacements never retroactively change what's already
 * published - only the next Publish/Republish does. Runs through the same
 * RLS-enforcing client; a copy only succeeds because both the source and
 * destination paths start with this tenant's own id.
 */
export async function publishSpace(
  _prevState: PublishState,
  formData: FormData
): Promise<PublishState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be logged in.", publishedAt: null };

  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) return { error: "Missing space.", publishedAt: null };

  // All rows across every image-bearing module, not just ones with a
  // current photo - a row whose photo was just removed (image_ref now
  // null) still needs its OLD published copy cleaned up, or it becomes a
  // permanent orphan (unreachable via the guest route the moment the
  // snapshot stops referencing it, but never actually deleted).
  const { data: mediaRows } = await supabase
    .from("module_items")
    .select("id, module_key, image_ref")
    .eq("tenant_id", tenantId)
    .in("module_key", MEDIA_MODULE_KEYS);

  // Each row's Storage work is independent of every other row's, so run
  // them concurrently rather than one at a time - found during end-to-end
  // verification: with facilitators, meals, treatments and facilities all
  // enabled at once, a sequential loop of list/remove/copy round-trips per
  // row made Publish/Republish noticeably slow. This is purely a
  // performance fix; the per-row logic itself is unchanged.
  await Promise.all(
    (mediaRows ?? []).map(async (row) => {
      const draftPath = row.image_ref as string | null;
      const publishedPath = draftPath ? publishedMediaPath(draftPath) : null;
      const folder = draftPath ? mediaItemFolder(draftPath) : `${tenantId}/${row.module_key}/${row.id}`;
      if (!folder) return;

      // Clean up every stale "published.*" sibling: either a different
      // file type from an earlier Publish (the organizer replaced a .jpg
      // with a .png and republished), or - when publishedPath is null
      // because the photo was removed entirely - every published.* file
      // for this item.
      const { data: siblings } = await supabase.storage.from(MEDIA_BUCKET).list(folder);
      const stalePublished = (siblings ?? [])
        .filter((f) => f.name.startsWith("published.") && `${folder}/${f.name}` !== publishedPath)
        .map((f) => `${folder}/${f.name}`);
      if (stalePublished.length > 0) {
        await supabase.storage.from(MEDIA_BUCKET).remove(stalePublished);
      }

      if (draftPath && publishedPath) {
        await supabase.storage.from(MEDIA_BUCKET).copy(draftPath, publishedPath);
      }
    })
  );

  const { data, error } = await supabase.rpc("publish_space", { p_tenant_id: tenantId });
  if (error) return { error: error.message, publishedAt: null };

  return { error: null, publishedAt: data as string };
}

export type { OptionalModuleKey };
