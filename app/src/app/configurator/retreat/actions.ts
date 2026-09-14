"use server";

import { z } from "zod";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { brandConfigSchema } from "@/lib/theme/tokens";
import { publicScheduleItemSchema } from "@/lib/schedule/types";
import { facilitatorSchema } from "@/lib/modules/facilitator";
import { mealSchema } from "@/lib/modules/meal";
import { treatmentSchema } from "@/lib/modules/treatment";
import { facilitySchema } from "@/lib/modules/facility";
import { arrivalInfoSchema } from "@/lib/modules/arrival";
import { faqItemSchema } from "@/lib/modules/faq";
import { customPageSchema } from "@/lib/modules/customPage";
import { socialLinksSchema } from "@/lib/modules/socialLinks";
import { IMPLEMENTED_OPTIONAL_MODULES, type OptionalModuleKey } from "@/lib/modules/catalog";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";
import { normalizeSlug, slugFormatError, isReservedSlug } from "@/lib/slug";
import { getSpaceEntitlement } from "@/lib/entitlements/getSpaceEntitlement";
import { deriveCommercialAvailability } from "@/lib/entitlements/availability";
import { getCustomPagesLimit } from "@/lib/entitlements/customPagesLimit";
import {
  MEDIA_BUCKET,
  MAX_IMAGE_DIMENSION,
  ALLOWED_IMAGE_TYPES,
  OPTIMIZED_IMAGE_EXTENSION,
  OPTIMIZED_IMAGE_MIME,
  isFileSizeAllowed,
  tenantMediaPath,
  mediaItemFolder,
} from "@/lib/media/path";
import { copyDraftToPublished } from "@/lib/media/publish";

/**
 * Guests must never be served an original, unoptimized upload - see the
 * Self Service Phase 1 media-safeguards requirement. This is the one
 * place any organizer-uploaded image is re-encoded before it's stored:
 * downscaled to a sane maximum display dimension and transcoded to WebP,
 * regardless of the source format (jpg/png/webp all normalize to the
 * same output). withoutEnlargement means a small source image is
 * compressed but never upscaled. Runs in the Server Action's Node.js
 * runtime (not Edge) - sharp requires Node.
 */
async function optimizeUploadedImage(file: File): Promise<Buffer> {
  const input = Buffer.from(await file.arrayBuffer());
  return sharp(input)
    .rotate() // apply EXIF orientation, then strip it - avoids sideways photos
    .resize({
      width: MAX_IMAGE_DIMENSION,
      height: MAX_IMAGE_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 82 })
    .toBuffer();
}

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

  const rawCustomPrimary = String(formData.get("customPrimary") ?? "").trim();
  const rawCustomSecondary = String(formData.get("customSecondary") ?? "").trim();
  const rawCustomNavigation = String(formData.get("customNavigation") ?? "").trim();
  const rawCustomText = String(formData.get("customText") ?? "").trim();

  // logoRef is deliberately not read/written here - Logo has its own
  // dedicated upload action (uploadBrandImage), scoped to just that
  // column, the same way module-item photos are never touched by their
  // module's bulk text-field save. This parse only validates the shape;
  // logoRef: null is a placeholder that never reaches the upsert below.
  const parsed = brandConfigSchema.safeParse({
    name,
    logoRef: null,
    palette: String(formData.get("palette") ?? "forest-sage"),
    customPrimary: rawCustomPrimary || null,
    customSecondary: rawCustomSecondary || null,
    customNavigation: rawCustomNavigation || null,
    customText: rawCustomText || null,
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
    custom_primary: parsed.data.customPrimary,
    custom_secondary: parsed.data.customSecondary,
    custom_navigation: parsed.data.customNavigation,
    custom_text: parsed.data.customText,
    atmosphere: parsed.data.atmosphere,
    image_style: parsed.data.imageStyle,
    updated_at: new Date().toISOString(),
  });
  if (brandError) return { error: brandError.message, tenantId };

  return { error: null, tenantId };
}

export type SaveScheduleState = { error: string | null };

type ScheduleItemUpsert = {
  id: string;
  tenant_id: string;
  date: string;
  start_time: string;
  end_time: string | null;
  title: string;
  facilitator: string | null;
  location: string | null;
  description: string | null;
  category: string | null;
};

/**
 * Upsert-by-id, delete-only-removed - the same invariant already proven for
 * Meals/Treatments/Facilities/Facilitators via saveModuleItemsGeneric,
 * brought to Schedule's own table. Schedule previously deleted every row
 * for the tenant and reinserted from scratch on every Save, which let
 * Postgres mint a fresh id on every save (confirmed live: two consecutive
 * saves of identical content produced two different row ids) - the exact
 * duplicate-row race already fixed everywhere else. schedule_items has no
 * image_ref/media concern, so this is simpler than saveModuleItemsGeneric,
 * not a variant of it - a shared abstraction across two different tables'
 * shapes would cost more clarity than the ~15 lines of duplication saves.
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

  const parsed = parseItemsWithIds(formData, publicScheduleItemSchema);
  if ("error" in parsed) return { error: parsed.error };

  const rows: ScheduleItemUpsert[] = parsed.data.map((item) => ({
    id: item.id,
    tenant_id: tenantId,
    date: item.date,
    start_time: item.startTime,
    end_time: item.endTime,
    title: item.title,
    facilitator: item.facilitator,
    location: item.location,
    description: item.description,
    category: item.category,
  }));

  const incomingIds = new Set(rows.map((r) => r.id));
  const { data: existingRows } = await supabase
    .from("schedule_items")
    .select("id")
    .eq("tenant_id", tenantId);
  const removedIds = (existingRows ?? []).filter((r) => !incomingIds.has(r.id)).map((r) => r.id);

  if (removedIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("schedule_items")
      .delete()
      .eq("tenant_id", tenantId)
      .in("id", removedIds);
    if (deleteError) return { error: deleteError.message };
  }

  if (rows.length > 0) {
    const { error: upsertError } = await supabase.from("schedule_items").upsert(rows, { onConflict: "id" });
    if (upsertError) return { error: upsertError.message };
  }

  return { error: null };
}

export type ScheduleItemStubState = { error: string | null };

/**
 * Schedule's counterpart to createModuleItemStub - a brand-new schedule
 * item must exist in the database from the moment it's added, not only
 * once the organizer clicks Save, for the same reason every other module
 * already works this way (see the Time to Flow persistence-consistency
 * fix). ON CONFLICT DO NOTHING: this call only guarantees the row exists,
 * never overwrites content a later Save (or a since-resolved earlier one)
 * already wrote.
 */
export async function createScheduleItemStub(
  _prevState: ScheduleItemStubState,
  formData: FormData
): Promise<ScheduleItemStubState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be logged in." };

  const tenantId = String(formData.get("tenantId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const date = String(formData.get("date") ?? "");
  const startTime = String(formData.get("startTime") ?? "");
  if (!tenantId || !itemId) return { error: "Missing space or item." };

  const { error } = await supabase.from("schedule_items").upsert(
    {
      id: itemId,
      tenant_id: tenantId,
      date: date || new Date().toISOString().slice(0, 10),
      start_time: startTime || "09:00",
      title: "Untitled",
    },
    { onConflict: "id", ignoreDuplicates: true }
  );
  if (error) return { error: error.message };

  return { error: null };
}

export type DeleteScheduleItemState = { error: string | null };

/** Schedule's counterpart to deleteModuleItem - no media to clean up, so
 * just the row. */
export async function deleteScheduleItem(
  _prevState: DeleteScheduleItemState,
  formData: FormData
): Promise<DeleteScheduleItemState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be logged in." };

  const tenantId = String(formData.get("tenantId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  if (!tenantId || !itemId) return { error: "Missing space or item." };

  const { error } = await supabase.from("schedule_items").delete().eq("id", itemId).eq("tenant_id", tenantId);
  if (error) return { error: error.message };

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

  // metadata is rebuilt from the FULL item every save (socialLinks AND
  // specialties together, from the same parsed object) - never a
  // hardcoded/partial object. This is the fix for the metadata round-trip
  // problem: PostgREST's upsert replaces the whole metadata column, so
  // the only safe way to avoid one field silently wiping the other is to
  // always write the complete current value, which the client always has
  // because [tenantId]/page.tsx loads metadata back into EditableFacilitator
  // on every page load (see resolveImageUrl's sibling there).
  const rows = parsed.data.map((item, i) => ({
    id: item.id,
    tenant_id: tenantId,
    module_key: "facilitators",
    title: item.name,
    subtitle: item.role,
    description: item.bio,
    sort_order: i,
    metadata: { socialLinks: item.socialLinks, specialties: item.specialties, imagePosition: item.imagePosition },
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

export type SaveFaqState = SaveModuleItemsState;

/**
 * metadata.enabled must survive every edit - rebuilt from the full parsed
 * item every save (same discipline as saveFacilitators' socialLinks/
 * specialties), never a hardcoded/partial object.
 */
export async function saveFaq(_prevState: SaveFaqState, formData: FormData): Promise<SaveFaqState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be logged in to save." };

  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) return { error: "Missing space." };

  const parsed = parseItemsWithIds(formData, faqItemSchema);
  if ("error" in parsed) return { error: parsed.error };

  const rows = parsed.data.map((item, i) => ({
    id: item.id,
    tenant_id: tenantId,
    module_key: "faq",
    title: item.question,
    subtitle: null,
    description: item.answer,
    sort_order: i,
    metadata: { enabled: item.enabled },
  }));
  return saveModuleItemsGeneric(supabase, tenantId, "faq", rows);
}

export type SaveCustomPagesState = SaveModuleItemsState;

/** Same metadata.enabled discipline as saveFaq. image_ref is deliberately
 * excluded from this bulk save (see saveModuleItemsGeneric's own comment
 * on why Save must never write that column) - photo upload/removal goes
 * through uploadModuleItemPhoto/removeModuleItemPhoto exactly like every
 * other module_items photo. */
export async function saveCustomPages(_prevState: SaveCustomPagesState, formData: FormData): Promise<SaveCustomPagesState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be logged in to save." };

  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) return { error: "Missing space." };

  const parsed = parseItemsWithIds(formData, customPageSchema);
  if ("error" in parsed) return { error: parsed.error };

  // Server-side enforcement of the Custom Pages limit - the "+ Add Page"
  // disabled state in custom-pages-step.tsx is a UX convenience only,
  // never the real gate. See lib/entitlements/customPagesLimit.ts for
  // why this reads the limit through a function instead of a literal 3.
  const entitlement = await getSpaceEntitlement(supabase, tenantId);
  const limit = getCustomPagesLimit(entitlement);
  if (parsed.data.length > limit) {
    return { error: `You've reached the ${limit}-page limit. Remove a page before adding another.` };
  }

  const rows = parsed.data.map((item, i) => ({
    id: item.id,
    tenant_id: tenantId,
    module_key: "customPages",
    title: item.title,
    subtitle: null,
    description: item.body,
    sort_order: i,
    metadata: { enabled: item.enabled },
  }));
  return saveModuleItemsGeneric(supabase, tenantId, "customPages", rows);
}

export type SaveStayConnectedState = { error: string | null };

export async function saveStayConnected(
  _prevState: SaveStayConnectedState,
  formData: FormData
): Promise<SaveStayConnectedState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be logged in to save." };

  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) return { error: "Missing space." };

  let links: unknown;
  try {
    links = JSON.parse(String(formData.get("links") ?? "[]"));
  } catch {
    return { error: "Could not read the links." };
  }
  const parsed = socialLinksSchema.safeParse(links);
  if (!parsed.success) return { error: "Some links weren't valid." };

  const { error } = await supabase.from("module_settings").upsert(
    {
      tenant_id: tenantId,
      module_key: "stayConnected",
      data: { links: parsed.data },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,module_key" }
  );
  if (error) return { error: error.message };

  return { error: null };
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
  if (!isFileSizeAllowed(file.size)) {
    return { error: "Image must be under 8MB.", imageRef: null, imageUrl: null };
  }

  // Every accepted upload is re-encoded here - downscaled to a sane
  // maximum dimension and transcoded to WebP - so guests are never served
  // an original heavy file, no matter what was uploaded. The stored path
  // always uses OPTIMIZED_IMAGE_EXTENSION regardless of the source
  // format; see optimizeUploadedImage's own comment.
  let optimized: Buffer;
  try {
    optimized = await optimizeUploadedImage(file);
  } catch {
    return { error: "That image could not be processed. Try a different file.", imageRef: null, imageUrl: null };
  }

  const path = tenantMediaPath(tenantId, moduleKey, itemId, OPTIMIZED_IMAGE_EXTENSION);

  // A previous upload may have been stored under a different path only if
  // it predates this optimization pass (back when the extension followed
  // the source file's own type) - clean it up so it doesn't linger as an
  // orphan now that every new upload lands at the same .webp path.
  if (previousRef && previousRef !== path) {
    await supabase.storage.from(MEDIA_BUCKET).remove([previousRef]);
  }

  const { error: uploadError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, optimized, { upsert: true, contentType: OPTIMIZED_IMAGE_MIME });
  if (uploadError) return { error: uploadError.message, imageRef: null, imageUrl: null };

  const { data: signed, error: signError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(path, 3600);
  if (signError || !signed) {
    return { error: signError?.message ?? "Uploaded, but preview failed.", imageRef: path, imageUrl: null };
  }

  // Found during the media-storage-lifecycle audit: this upsert's error
  // was never checked - a real failure here would leave the just-written
  // Storage object (draft.webp already has the new bytes) with nothing in
  // the database pointing at it, while still reporting success to the
  // organizer. uploadBrandImage's equivalent write already checks its
  // error (see below); this brings module_items in line with it.
  const { error: dbError } = await supabase.from("module_items").upsert(
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
  if (dbError) return { error: dbError.message, imageRef: null, imageUrl: null };

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

// ---------------------------------------------------------------------
// Brand-level media (Today Hero, Space Image, Logo) - same upload/remove
// shape as uploadModuleItemPhoto/removeModuleItemPhoto above, targeting
// brand_configs' three single-image columns instead of a module_items
// row. Kept as its own pair rather than generalizing the module_items
// functions, since the persistence target (an upsert-by-id row vs. an
// update-by-tenant column) is genuinely different, not just a different
// moduleKey string.
//
// PRE-MIGRATION 0014: brand_configs.hero_image_ref/space_image_ref/
// logo_ref do not exist on Production yet - calling this against
// Production before that migration is applied returns a real database
// error (column does not exist), not a silent no-op. That is intentional
// - see the Product Completion pre-migration report.
// ---------------------------------------------------------------------

export type BrandImageKind = "hero" | "space" | "logo";

const BRAND_IMAGE_COLUMN: Record<BrandImageKind, "hero_image_ref" | "space_image_ref" | "logo_ref"> = {
  hero: "hero_image_ref",
  space: "space_image_ref",
  logo: "logo_ref",
};

export type UploadBrandImageState = {
  error: string | null;
  imageRef: string | null;
  imageUrl: string | null;
};

export async function uploadBrandImage(
  _prevState: UploadBrandImageState,
  formData: FormData
): Promise<UploadBrandImageState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be logged in.", imageRef: null, imageUrl: null };

  const tenantId = String(formData.get("tenantId") ?? "");
  const kind = String(formData.get("kind") ?? "") as BrandImageKind;
  const previousRef = String(formData.get("previousRef") ?? "") || null;
  const file = formData.get("file");
  if (!tenantId || !(kind in BRAND_IMAGE_COLUMN)) {
    return { error: "Missing space or image type.", imageRef: null, imageUrl: null };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { error: "No file selected.", imageRef: null, imageUrl: null };
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { error: "Please upload a JPG, PNG or WEBP image.", imageRef: null, imageUrl: null };
  }
  if (!isFileSizeAllowed(file.size)) {
    return { error: "Image must be under 8MB.", imageRef: null, imageUrl: null };
  }

  let optimized: Buffer;
  try {
    optimized = await optimizeUploadedImage(file);
  } catch {
    return { error: "That image could not be processed. Try a different file.", imageRef: null, imageUrl: null };
  }

  const path = tenantMediaPath(tenantId, "brand", kind, OPTIMIZED_IMAGE_EXTENSION);

  if (previousRef && previousRef !== path) {
    await supabase.storage.from(MEDIA_BUCKET).remove([previousRef]);
  }

  const { error: uploadError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, optimized, { upsert: true, contentType: OPTIMIZED_IMAGE_MIME });
  if (uploadError) return { error: uploadError.message, imageRef: null, imageUrl: null };

  const { data: signed, error: signError } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path, 3600);
  if (signError || !signed) {
    return { error: signError?.message ?? "Uploaded, but preview failed.", imageRef: path, imageUrl: null };
  }

  const column = BRAND_IMAGE_COLUMN[kind];
  const { error: dbError } = await supabase
    .from("brand_configs")
    .upsert({ tenant_id: tenantId, [column]: path, updated_at: new Date().toISOString() }, { onConflict: "tenant_id" });
  if (dbError) return { error: dbError.message, imageRef: null, imageUrl: null };

  return { error: null, imageRef: path, imageUrl: signed.signedUrl };
}

export type RemoveBrandImageState = { error: string | null };

export async function removeBrandImage(
  _prevState: RemoveBrandImageState,
  formData: FormData
): Promise<RemoveBrandImageState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be logged in." };

  const tenantId = String(formData.get("tenantId") ?? "");
  const kind = String(formData.get("kind") ?? "") as BrandImageKind;
  const imageRef = String(formData.get("imageRef") ?? "");
  if (!imageRef || !(kind in BRAND_IMAGE_COLUMN)) return { error: null };

  const { error } = await supabase.storage.from(MEDIA_BUCKET).remove([imageRef]);
  if (error) return { error: error.message };

  if (tenantId) {
    const column = BRAND_IMAGE_COLUMN[kind];
    await supabase.from("brand_configs").update({ [column]: null }).eq("tenant_id", tenantId);
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

const MEDIA_MODULE_KEYS = ["facilitators", "meals", "treatments", "facilities", "customPages"];

/**
 * The only way anything reaches published_spaces. Calls the
 * publish_space(uuid) database function - one atomic transaction, running
 * as the signed-in owner through the normal RLS-enforcing client, never
 * the admin client. A non-owner's call fails inside the same transaction
 * (RLS on the underlying tables/insert), nothing partially applies either way.
 *
 * Before calling it, snapshot every current draft photo - both
 * module_items rows (across every image-bearing module) AND the three
 * brand-level refs (Today Hero, Space Image, Logo) - into its stable
 * published-path counterpart (see copyDraftToPublished). This is the
 * media equivalent of what publish_space() already does for text: take a
 * copy of the current draft state, not a live reference to it, so further
 * draft edits/replacements never retroactively change what's already
 * published - only the next Publish/Republish does. publish_space()
 * itself (the SQL function) only ever string-transforms a path for the
 * JSON it writes - it never touches Storage bytes, which is why this
 * copy must happen here, before the RPC call, not inside it.
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

  // UX-only pre-check, fails fast before the media Storage work below -
  // the authoritative enforcement is inside publish_space() itself (the
  // RPC call at the end of this function), which cannot be bypassed even
  // if this check were removed or called incorrectly.
  const entitlement = await getSpaceEntitlement(supabase, tenantId);
  const availability = deriveCommercialAvailability(entitlement);
  if (!availability.canPublish) {
    return {
      error: "This Space needs active commercial access before it can be published.",
      publishedAt: null,
    };
  }

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

  // brand_configs' three brand-level image refs (Hero/Space/Logo) need the
  // exact same draft->published treatment as any module_items photo -
  // this select and the copies below are what actually makes the
  // migration 0014 design (modules.brand.{hero,space,logo}.imageRef)
  // real rather than a dangling path. Selecting brand_configs columns
  // that don't exist yet on Production (pre-0014) would error, not
  // silently no-op - see the Pending column note at this function's call
  // sites until 0014 is applied.
  const { data: brandRow } = await supabase
    .from("brand_configs")
    .select("hero_image_ref, space_image_ref, logo_ref")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  // Each item's Storage work is independent of every other item's, so run
  // them concurrently rather than one at a time - found during end-to-end
  // verification: with facilitators, meals, treatments and facilities all
  // enabled at once, a sequential loop of list/remove/copy round-trips per
  // row made Publish/Republish noticeably slow. This is purely a
  // performance fix; the per-item logic itself is unchanged.
  //
  // A failed media publish must never produce a "successful" Publish -
  // Promise.all rejects on the first failure, and that rejection MUST
  // stop this function before the publish_space() RPC is ever called, or
  // published_at would update (reporting success to the organizer) while
  // some guest-visible image silently stayed stale. copyDraftToPublished
  // throws MediaPublishError for every Storage failure it can hit; none
  // of them are swallowed here.
  try {
    await Promise.all([
      ...(mediaRows ?? []).map((row) =>
        copyDraftToPublished(supabase, row.image_ref as string | null, `${tenantId}/${row.module_key}/${row.id}`)
      ),
      copyDraftToPublished(supabase, brandRow?.hero_image_ref ?? null, `${tenantId}/brand/hero`),
      copyDraftToPublished(supabase, brandRow?.space_image_ref ?? null, `${tenantId}/brand/space`),
      copyDraftToPublished(supabase, brandRow?.logo_ref ?? null, `${tenantId}/brand/logo`),
    ]);
  } catch (err) {
    return {
      error: err instanceof Error ? `Could not publish your photos - ${err.message}` : "Could not publish your photos.",
      publishedAt: null,
    };
  }

  const { data, error } = await supabase.rpc("publish_space", { p_tenant_id: tenantId });
  if (error) return { error: error.message, publishedAt: null };

  return { error: null, publishedAt: data as string };
}

// ---------------------------------------------------------------------
// Space public address (slug) - Self Service Phase 1. See
// supabase/migrations/0010_self_service_spaces.sql for the actual
// enforcement (format check constraint, reserved-word trigger, partial
// unique index); everything here is either a friendly pre-check or a
// plain write through the same owner-scoped RLS every other tenants
// update already goes through - no new bypass, no admin client.
// ---------------------------------------------------------------------

export type SlugCheckState = {
  status: "idle" | "invalid" | "reserved" | "available" | "unavailable";
  slug: string;
  error: string | null;
};

/**
 * Advisory-only: calls the is_slug_available(text) RPC (SECURITY DEFINER,
 * returns a boolean and nothing else - see the migration). Never the
 * source of truth for uniqueness; two people can both be told "available"
 * for the same slug and race each other to reserveSlug below - the
 * database's unique index is what actually resolves that, not this check.
 */
export async function checkSlugAvailability(
  _prevState: SlugCheckState,
  formData: FormData
): Promise<SlugCheckState> {
  const slug = normalizeSlug(String(formData.get("slug") ?? ""));

  if (slugFormatError(slug)) return { status: "invalid", slug, error: null };
  if (isReservedSlug(slug)) return { status: "reserved", slug, error: null };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_slug_available", { check_slug: slug });
  if (error) return { status: "idle", slug, error: error.message };

  return { status: data ? "available" : "unavailable", slug, error: null };
}

export type ReserveSlugState = { error: string | null; slug: string | null; tenantId: string | null };

/**
 * Claims a public address for a Space. Creates the tenant (same lazy-
 * create behavior as saveDraft) if this is the very first save, so the
 * address can be reserved before the rest of the build is complete rather
 * than only at the end - otherwise just updates the existing tenant's
 * slug column, through the ordinary RLS-enforcing client (the existing
 * "tenants: owners can update" policy from 0001_init.sql already covers
 * this column, nothing new needed there).
 *
 * A unique-violation (Postgres code 23505) means someone else claimed the
 * same slug in the moment between this organizer's availability check and
 * this submit - reported as a plain, expected "try another one" outcome,
 * not a server error.
 */
export async function reserveSlug(_prevState: ReserveSlugState, formData: FormData): Promise<ReserveSlugState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be logged in to save.", slug: null, tenantId: null };

  let tenantId = String(formData.get("tenantId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? DEFAULT_TIMEZONE);
  const slug = normalizeSlug(String(formData.get("slug") ?? ""));

  if (slugFormatError(slug)) {
    return { error: "That address isn't valid.", slug: null, tenantId: tenantId || null };
  }
  if (isReservedSlug(slug)) {
    return { error: "That address is reserved.", slug: null, tenantId: tenantId || null };
  }

  if (!tenantId) {
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .insert({ name: name || "Untitled Retreat", product_type: "retreat", timezone, slug })
      .select("id")
      .single();
    if (tenantError) {
      if (tenantError.code === "23505") {
        return { error: "That address was just taken - try another.", slug: null, tenantId: null };
      }
      return { error: tenantError.message, slug: null, tenantId: null };
    }
    tenantId = tenant.id;
  } else {
    const { error: updateError } = await supabase.from("tenants").update({ slug }).eq("id", tenantId);
    if (updateError) {
      if (updateError.code === "23505") {
        return { error: "That address was just taken - try another.", slug: null, tenantId };
      }
      return { error: updateError.message, slug: null, tenantId };
    }
  }

  return { error: null, slug, tenantId };
}

export type { OptionalModuleKey };
