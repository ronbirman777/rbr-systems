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
import { retreatProfileSchema, RETREAT_PROFILE_KEY } from "@/lib/modules/retreatProfile";
import { moduleIntrosSchema, pruneModuleIntros, MODULE_INTROS_KEY } from "@/lib/modules/moduleIntro";
import { guidelineSchema, GUIDELINES_KEY } from "@/lib/modules/guideline";
import { inspirationItemSchema, DAILY_INSPIRATION_KEY } from "@/lib/modules/dailyInspiration";
import {
  FLOW_AUDIO_FOLDER_KEY,
  FLOW_AUDIO_KEY,
  FLOW_READINGS_KEY,
  flowAudioMetadataSchema,
} from "@/lib/modules/flowLibrary";
import { libraryItemFieldsSchema, readingMetadataSchema } from "@/lib/modules/library";
import {
  AUDIO_ALLOWED_TYPES,
  MAX_AUDIO_BYTES,
  isAudioSizeAllowed,
  normalizeMimeType,
  parseAudioDraftRef,
} from "@/lib/media/audio";
import { imagePositionSchema } from "@/lib/modules/imagePosition";
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
  newUploadId,
  isDraftMediaPathForTenant,
  collectMediaRefs,
  versionedMediaPath,
} from "@/lib/media/path";
import { copyDraftToPublished, copyDraftAudioToPublished } from "@/lib/media/publish";
import { cleanupStalePublishedMedia } from "@/lib/media/publishedCleanup";

import { localeFromFormData, studioMessages, translate, DEFAULT_LOCALE, type Locale } from "@/lib/i18n";
/**
 * Best-effort removal of DRAFT objects only (TASK 023). Studio operations
 * never touch `published.*` objects - the live snapshot may still
 * reference them until the next successful Publish, whose post-publish
 * sweep removes them. Every path is checked with isDraftMediaPathForTenant
 * because several callers take the ref from the client. A failure here
 * leaves an unreferenced draft object (harmless), never a broken page, so
 * it is deliberately not surfaced.
 */
async function removeDraftObjects(
  supabase: SupabaseClient,
  tenantId: string,
  refs: ReadonlyArray<string | null | undefined>
): Promise<void> {
  const targets = [...new Set(refs.filter((r): r is string => !!r && isDraftMediaPathForTenant(tenantId, r)))];
  if (targets.length === 0) return;
  await supabase.storage.from(MEDIA_BUCKET).remove(targets);
}

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
  /** Set only when tenant creation was rejected specifically for lack of
   * an available Space slot (Task 011) - distinct from every other error
   * so the caller can render the honest "Add Space / upgrade required"
   * state instead of a generic save failure. */
  slotLimitReached?: boolean;
};

/** Postgres RAISE ... USING HINT = 'SLOT_LIMIT_REACHED' inside
 * enforce_space_slot_capacity() (0017_space_management_slots.sql) is the
 * one signal this Server Action trusts to distinguish "no available
 * slots" from every other creation failure - matched on the error's own
 * `hint` field (PostgREST surfaces a RAISE's HINT there), never on
 * message text, which is not a stable contract. */
function isSlotLimitError(error: { hint?: string | null } | null | undefined): boolean {
  return error?.hint === "SLOT_LIMIT_REACHED";
}

/**
 * Creates the tenant on first save (empty tenantId field) and upserts its
 * brand config on every save. This is real persistence, scoped by RLS to
 * the signed-in user - not a local-storage stand-in.
 *
 * Task 011: brand validation now runs BEFORE tenant creation on the
 * first-save path specifically so a validation failure can never strand
 * an already-consumed Space slot behind a bare tenant row with no usable
 * content - the previous ordering created the tenant first and validated
 * second, so a rejected brand payload still left a real row (and, after
 * this task, a real consumed slot) behind. Capacity itself is enforced
 * database-side by enforce_space_slot_capacity() (0017), not here - this
 * function only surfaces that outcome legibly.
 */
export async function saveDraft(
  prevState: SaveDraftState,
  formData: FormData
): Promise<SaveDraftState> {
  const t = studioMessages(localeFromFormData(formData));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("notLoggedInToSave"), tenantId: null };

  let tenantId = String(formData.get("tenantId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? DEFAULT_TIMEZONE);

  const rawCustomPrimary = String(formData.get("customPrimary") ?? "").trim();
  const rawCustomSecondary = String(formData.get("customSecondary") ?? "").trim();
  const rawCustomNavigation = String(formData.get("customNavigation") ?? "").trim();
  const rawCustomSurface = String(formData.get("customSurface") ?? "").trim();
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
    customSurface: rawCustomSurface || null,
    customText: rawCustomText || null,
    atmosphere: String(formData.get("atmosphere") ?? "calm-organic"),
    imageStyle: "rounded",
  });
  if (!parsed.success) {
    return { error: t("someBrandDetailsInvalid"), tenantId };
  }

  if (!tenantId) {
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .insert({ name: name || translate(localeFromFormData(formData), "flow", "untitledRetreat"), product_type: "retreat", timezone })
      .select("id")
      .single();
    if (tenantError || !tenant) {
      if (isSlotLimitError(tenantError)) {
        return {
          error: t("noSlotsLeft"),
          tenantId: null,
          slotLimitReached: true,
        };
      }
      return { error: tenantError?.message ?? t("couldNotCreateSpace"), tenantId: null };
    }
    tenantId = tenant.id;
  } else {
    await supabase
      .from("tenants")
      .update({ name: name || translate(localeFromFormData(formData), "flow", "untitledRetreat"), timezone })
      .eq("id", tenantId);
  }

  const { error: brandError } = await supabase.from("brand_configs").upsert({
    tenant_id: tenantId,
    name: parsed.data.name,
    palette: parsed.data.palette,
    custom_primary: parsed.data.customPrimary,
    custom_secondary: parsed.data.customSecondary,
    custom_navigation: parsed.data.customNavigation,
    custom_surface: parsed.data.customSurface,
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
  /** TASK 029 (P5D) - the one column 0033 added. */
  metadata: Record<string, unknown>;
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
  const t = studioMessages(localeFromFormData(formData));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("notLoggedInToSave") };

  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) return { error: t("missingSpace") };

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
    // Written whole on every save, for the same reason every module's
    // metadata is (see saveFacilitators): PostgREST replaces the column,
    // so a partial write would silently drop the other key.
    metadata: { whatToBring: item.whatToBring, whatToExpect: item.whatToExpect },
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
  const t = studioMessages(localeFromFormData(formData));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("notLoggedIn") };

  const tenantId = String(formData.get("tenantId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const date = String(formData.get("date") ?? "");
  const startTime = String(formData.get("startTime") ?? "");
  if (!tenantId || !itemId) return { error: t("missingSpaceOrItem") };

  const { error } = await supabase.from("schedule_items").upsert(
    {
      id: itemId,
      tenant_id: tenantId,
      date: date || new Date().toISOString().slice(0, 10),
      start_time: startTime || "09:00",
      title: translate(localeFromFormData(formData), "common", "untitled"),
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
  const t = studioMessages(localeFromFormData(formData));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("notLoggedIn") };

  const tenantId = String(formData.get("tenantId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  if (!tenantId || !itemId) return { error: t("missingSpaceOrItem") };

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
  const t = studioMessages(localeFromFormData(formData));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("notLoggedInToSave") };

  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) return { error: t("missingSpace") };

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
  /**
   * TASK 029: Readings may link out instead of (or as well as) carrying
   * their own text. Optional so the modules that have no such concept
   * simply omit it - PostgREST's upsert only writes the keys present in
   * the payload, and every save sends rows for one module at a time.
   */
  external_link?: string | null;
};

async function saveModuleItemsGeneric(
  supabase: SupabaseClient,
  tenantId: string,
  moduleKey: string,
  rows: ModuleItemUpsert[]
): Promise<SaveModuleItemsState> {
  const incomingIds = new Set(rows.map((r) => r.id));

  // Rows that exist in the database but aren't in this submission are
  // genuinely gone, not just edited - their draft media (if any) needs the
  // same cleanup an explicit Remove would do (see deleteModuleItem, which
  // this mirrors), and the row itself needs deleting. Everything else (kept or
  // brand-new) is a plain upsert by id below - never a delete+reinsert,
  // so an id that already exists is always updated in place, never
  // replaced by a new one.
  const { data: existingRows } = await supabase
    .from("module_items")
    .select("id, image_ref")
    .eq("tenant_id", tenantId)
    .eq("module_key", moduleKey);
  const removedRows = (existingRows ?? []).filter((r) => !incomingIds.has(r.id));

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
    // Only after the rows are gone, and only their DRAFT objects - a
    // published copy stays until the next successful Publish.
    await removeDraftObjects(
      supabase,
      tenantId,
      removedRows.map((r) => r.image_ref as string | null)
    );
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
  const t = studioMessages(localeFromFormData(formData));
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    return { error: t("couldNotReadList") };
  }
  if (!Array.isArray(raw)) return { error: t("couldNotReadList") };

  const parsed = z.array(schema).safeParse(raw);
  if (!parsed.success) return { error: t("someDetailsInvalid") };

  const ids = raw.map((r) => (r && typeof r === "object" && "id" in r ? String((r as { id: unknown }).id) : ""));
  if (ids.some((id) => !id)) return { error: t("missingItemId") };

  return { data: parsed.data.map((item, i) => ({ ...item, id: ids[i] })) };
}

export type SaveFacilitatorsState = SaveModuleItemsState;

export async function saveFacilitators(
  _prevState: SaveFacilitatorsState,
  formData: FormData
): Promise<SaveFacilitatorsState> {
  const t = studioMessages(localeFromFormData(formData));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("notLoggedInToSave") };

  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) return { error: t("missingSpace") };

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
    metadata: {
      socialLinks: item.socialLinks,
      specialties: item.specialties,
      imagePosition: item.imagePosition,
      // TASK 029 (D5) - the long bio. `bio` keeps its meaning (short).
      longBio: item.longBio,
    },
  }));
  return saveModuleItemsGeneric(supabase, tenantId, "facilitators", rows);
}

export type SaveMealsState = SaveModuleItemsState;

export async function saveMeals(_prevState: SaveMealsState, formData: FormData): Promise<SaveMealsState> {
  const t = studioMessages(localeFromFormData(formData));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("notLoggedInToSave") };

  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) return { error: t("missingSpace") };

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
      imagePosition: item.imagePosition,
    },
  }));
  return saveModuleItemsGeneric(supabase, tenantId, "meals", rows);
}

export type SaveTreatmentsState = SaveModuleItemsState;

export async function saveTreatments(
  _prevState: SaveTreatmentsState,
  formData: FormData
): Promise<SaveTreatmentsState> {
  const t = studioMessages(localeFromFormData(formData));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("notLoggedInToSave") };

  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) return { error: t("missingSpace") };

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
      imagePosition: item.imagePosition,
      // TASK 029 (D1) - Treatments & Extras. Retreat-item pricing only:
      // nothing here is connected to space_entitlements or Stripe.
      price: item.price,
      currency: item.currency,
      chargeType: item.chargeType,
      availability: item.availability,
    },
  }));
  return saveModuleItemsGeneric(supabase, tenantId, "treatments", rows);
}

export type SaveFacilitiesState = SaveModuleItemsState;

export async function saveFacilities(
  _prevState: SaveFacilitiesState,
  formData: FormData
): Promise<SaveFacilitiesState> {
  const t = studioMessages(localeFromFormData(formData));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("notLoggedInToSave") };

  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) return { error: t("missingSpace") };

  const parsed = parseItemsWithIds(formData, facilitySchema);
  if ("error" in parsed) return { error: parsed.error };

  const rows = parsed.data.map((item, i) => ({
    id: item.id,
    tenant_id: tenantId,
    module_key: "facilities",
    title: item.name,
    // TASK 029 (D4): the short line goes in `subtitle`, the column
    // treatments has always used for exactly this. There is deliberately
    // no metadata.shortDescription - see lib/modules/facility.ts.
    subtitle: item.shortDescription,
    description: item.description,
    sort_order: i,
    metadata: {
      openingHours: item.openingHours,
      location: item.location,
      importantInfo: item.importantInfo,
      imagePosition: item.imagePosition,
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
  const t = studioMessages(localeFromFormData(formData));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("notLoggedInToSave") };

  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) return { error: t("missingSpace") };

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
  const t = studioMessages(localeFromFormData(formData));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("notLoggedInToSave") };

  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) return { error: t("missingSpace") };

  const parsed = parseItemsWithIds(formData, customPageSchema);
  if ("error" in parsed) return { error: parsed.error };

  // Server-side enforcement of the Custom Pages limit - the "+ Add Page"
  // disabled state in custom-pages-step.tsx is a UX convenience only,
  // never the real gate. See lib/entitlements/customPagesLimit.ts for
  // why this reads the limit through a function instead of a literal 3.
  const entitlement = await getSpaceEntitlement(supabase, tenantId);
  const limit = getCustomPagesLimit(entitlement);
  if (parsed.data.length > limit) {
    return { error: t("pageLimitReached", { limit }) };
  }

  const rows = parsed.data.map((item, i) => ({
    id: item.id,
    tenant_id: tenantId,
    module_key: "customPages",
    title: item.title,
    subtitle: null,
    description: item.body,
    sort_order: i,
    metadata: { enabled: item.enabled, imagePosition: item.imagePosition },
  }));
  return saveModuleItemsGeneric(supabase, tenantId, "customPages", rows);
}

export type SaveStayConnectedState = { error: string | null };

export async function saveStayConnected(
  _prevState: SaveStayConnectedState,
  formData: FormData
): Promise<SaveStayConnectedState> {
  const t = studioMessages(localeFromFormData(formData));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("notLoggedInToSave") };

  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) return { error: t("missingSpace") };

  let links: unknown;
  try {
    links = JSON.parse(String(formData.get("links") ?? "[]"));
  } catch {
    return { error: t("couldNotReadLinks") };
  }
  const parsed = socialLinksSchema.safeParse(links);
  if (!parsed.success) return { error: t("someLinksInvalid") };

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
  const t = studioMessages(localeFromFormData(formData));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("notLoggedInToSave") };

  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) return { error: t("missingSpace") };

  let data: unknown;
  try {
    data = JSON.parse(String(formData.get("data") ?? "{}"));
  } catch {
    return { error: t("couldNotReadArrival") };
  }
  const parsed = arrivalInfoSchema.safeParse(data);
  if (!parsed.success) return { error: t("someArrivalDetailsInvalid") };

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
 * Uploads an item's photo to a brand-new versioned path (new uploadId, so
 * create-only: nothing is ever overwritten and no Storage UPDATE is
 * needed). Runs through the ordinary RLS-enforcing server client,
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
  const t = studioMessages(localeFromFormData(formData));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("notLoggedIn"), imageRef: null, imageUrl: null };

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
    return { error: t("missingSpaceOrItem"), imageRef: null, imageUrl: null };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { error: t("noFileSelected"), imageRef: null, imageUrl: null };
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { error: t("unsupportedImage"), imageRef: null, imageUrl: null };
  }
  if (!isFileSizeAllowed(file.size)) {
    return { error: t("imageTooLarge"), imageRef: null, imageUrl: null };
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
    return { error: t("imageNotProcessed"), imageRef: null, imageUrl: null };
  }

  // Every upload gets its own uploadId folder, so a replacement never
  // overwrites the object a published snapshot may still reference, and
  // its published copy (made at Publish) lands on a fresh key too.
  const path = tenantMediaPath(tenantId, moduleKey, itemId, OPTIMIZED_IMAGE_EXTENSION, newUploadId());

  const { data: existing } = await supabase
    .from("module_items")
    .select("image_ref")
    .eq("id", itemId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const oldDraftRef = (existing?.image_ref as string | null | undefined) ?? null;

  const { error: uploadError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, optimized, { upsert: false, contentType: OPTIMIZED_IMAGE_MIME });
  if (uploadError) return { error: uploadError.message, imageRef: null, imageUrl: null };

  const { data: signed, error: signError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(path, 3600);
  if (signError || !signed) {
    return { error: signError?.message ?? t("uploadedPreviewFailed"), imageRef: path, imageUrl: null };
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
      title: title || translate(localeFromFormData(formData), "common", "untitled"),
      subtitle,
      description,
      image_ref: path,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
    },
    { onConflict: "id" }
  );
  if (dbError) {
    await removeDraftObjects(supabase, tenantId, [path]);
    return { error: dbError.message, imageRef: null, imageUrl: null };
  }

  // The row now points at the new draft; the replaced DRAFT object is
  // orphaned and can go. Its published copy (if any) is left alone.
  await removeDraftObjects(supabase, tenantId, [oldDraftRef, previousRef].filter((r) => r !== path));

  return { error: null, imageRef: path, imageUrl: signed.signedUrl };
}

export type RemoveModuleItemPhotoState = { error: string | null };

export async function removeModuleItemPhoto(
  _prevState: RemoveModuleItemPhotoState,
  formData: FormData
): Promise<RemoveModuleItemPhotoState> {
  const t = studioMessages(localeFromFormData(formData));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("notLoggedIn") };

  const tenantId = String(formData.get("tenantId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const imageRef = String(formData.get("imageRef") ?? "");
  if (!imageRef || !tenantId) return { error: null };

  // Draft-only: the published copy stays until the next successful
  // Publish. The DB reference is cleared first so a failure can never
  // leave a row pointing at a deleted draft.
  let dbRef: string | null = null;
  if (itemId) {
    const { data: row } = await supabase
      .from("module_items")
      .select("image_ref")
      .eq("id", itemId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    dbRef = (row?.image_ref as string | null | undefined) ?? null;
    const { error } = await supabase
      .from("module_items")
      .update({ image_ref: null })
      .eq("id", itemId)
      .eq("tenant_id", tenantId);
    if (error) return { error: error.message };
  }
  await removeDraftObjects(supabase, tenantId, [imageRef, dbRef]);

  return { error: null };
}

// ---------------------------------------------------------------------
// Explore module hero/cover image (added alongside Task 015) - one image
// PER MODULE (module_configs, keyed by tenant_id+module_key), distinct
// from the per-ITEM photos above. Same upload/remove shape and the same
// Storage bucket/RLS as uploadModuleItemPhoto/removeModuleItemPhoto, but
// its own pair rather than a generalization: the persistence target
// (upsert-by-(tenant,module_key) vs. upsert-by-id) is genuinely
// different, matching this file's own established convention (see the
// brand-media pair immediately below, kept separate for the same
// reason). The synthetic "_cover" path segment keeps the same
// `tenantMediaPath(tenantId, moduleKey, itemId, ext)` shape used
// everywhere else in this file without colliding with any real
// module_items id (those are always UUIDs).
// ---------------------------------------------------------------------

const MODULE_COVER_ITEM_ID = "_cover";

export type UploadModuleCoverPhotoState = {
  error: string | null;
  imageRef: string | null;
  imageUrl: string | null;
};

export async function uploadModuleCoverPhoto(
  _prevState: UploadModuleCoverPhotoState,
  formData: FormData
): Promise<UploadModuleCoverPhotoState> {
  const t = studioMessages(localeFromFormData(formData));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("notLoggedIn"), imageRef: null, imageUrl: null };

  const tenantId = String(formData.get("tenantId") ?? "");
  const moduleKey = String(formData.get("moduleKey") ?? "");
  const previousRef = String(formData.get("previousRef") ?? "") || null;
  const file = formData.get("file");
  if (!tenantId || !moduleKey) return { error: t("missingSpaceOrModule"), imageRef: null, imageUrl: null };
  if (!(file instanceof File) || file.size === 0) {
    return { error: t("noFileSelected"), imageRef: null, imageUrl: null };
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { error: t("unsupportedImage"), imageRef: null, imageUrl: null };
  }
  if (!isFileSizeAllowed(file.size)) {
    return { error: t("imageTooLarge"), imageRef: null, imageUrl: null };
  }

  let optimized: Buffer;
  try {
    optimized = await optimizeUploadedImage(file);
  } catch {
    return { error: t("imageNotProcessed"), imageRef: null, imageUrl: null };
  }

  const path = tenantMediaPath(tenantId, moduleKey, MODULE_COVER_ITEM_ID, OPTIMIZED_IMAGE_EXTENSION, newUploadId());

  const { data: existing } = await supabase
    .from("module_configs")
    .select("image_ref")
    .eq("tenant_id", tenantId)
    .eq("module_key", moduleKey)
    .maybeSingle();
  const oldDraftRef = (existing?.image_ref as string | null | undefined) ?? null;

  const { error: uploadError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, optimized, { upsert: false, contentType: OPTIMIZED_IMAGE_MIME });
  if (uploadError) return { error: uploadError.message, imageRef: null, imageUrl: null };

  const { data: signed, error: signError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(path, 3600);
  if (signError || !signed) {
    return { error: signError?.message ?? t("uploadedPreviewFailed"), imageRef: path, imageUrl: null };
  }

  // Upsert (not update) so a module the organizer hasn't explicitly
  // saved via "SAVE MODULES" yet still gets a real row the moment a
  // cover photo is attached - same reasoning as uploadModuleItemPhoto's
  // own upsert, applied to this table's own (tenant_id, module_key) key.
  //
  // TASK 020: image_position is explicitly reset to null on every
  // upload (first-time or replacement) - "replacement resets to center"
  // (a brand-new or different photo has no reason to inherit the
  // previous photo's focus point). Safe to write unconditionally here,
  // unlike module_items' metadata column: module_configs has no other
  // fields sharing this row that a blind overwrite could clobber.
  const { error: dbError } = await supabase.from("module_configs").upsert(
    { tenant_id: tenantId, module_key: moduleKey, image_ref: path, image_position: null },
    { onConflict: "tenant_id,module_key" }
  );
  if (dbError) {
    await removeDraftObjects(supabase, tenantId, [path]);
    return { error: dbError.message, imageRef: null, imageUrl: null };
  }

  await removeDraftObjects(supabase, tenantId, [oldDraftRef, previousRef].filter((r) => r !== path));

  return { error: null, imageRef: path, imageUrl: signed.signedUrl };
}

export type RemoveModuleCoverPhotoState = { error: string | null };

export async function removeModuleCoverPhoto(
  _prevState: RemoveModuleCoverPhotoState,
  formData: FormData
): Promise<RemoveModuleCoverPhotoState> {
  const t = studioMessages(localeFromFormData(formData));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("notLoggedIn") };

  const tenantId = String(formData.get("tenantId") ?? "");
  const moduleKey = String(formData.get("moduleKey") ?? "");
  const imageRef = String(formData.get("imageRef") ?? "");
  if (!imageRef || !tenantId) return { error: null };

  let dbRef: string | null = null;
  if (moduleKey) {
    const { data: row } = await supabase
      .from("module_configs")
      .select("image_ref")
      .eq("tenant_id", tenantId)
      .eq("module_key", moduleKey)
      .maybeSingle();
    dbRef = (row?.image_ref as string | null | undefined) ?? null;
    // TASK 020: image_position clears alongside image_ref - stale focal
    // metadata for an image that no longer exists must never survive to
    // silently apply to whatever cover is uploaded next.
    const { error } = await supabase
      .from("module_configs")
      .update({ image_ref: null, image_position: null })
      .eq("tenant_id", tenantId)
      .eq("module_key", moduleKey);
    if (error) return { error: error.message };
  }
  await removeDraftObjects(supabase, tenantId, [imageRef, dbRef]);

  return { error: null };
}

export type UpdateModuleCoverPositionState = { error: string | null };

/**
 * TASK 020 - instant-persist focal-point update for a module cover.
 * Module covers have no "Save" step of their own the way module_items
 * lists do (upload/remove already persist immediately - see
 * uploadModuleCoverPhoto/removeModuleCoverPhoto's own comments); this
 * matches that same instant-persist contract for the focal point itself,
 * rather than leaving it stranded in local state with nothing to flush
 * it. `position` is `null` for "reset to default" - validated as either
 * null or a real {x,y} pair, never partially trusted, before being
 * written.
 */
export async function updateModuleCoverPosition(
  _prevState: UpdateModuleCoverPositionState,
  formData: FormData
): Promise<UpdateModuleCoverPositionState> {
  const t = studioMessages(localeFromFormData(formData));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("notLoggedIn") };

  const tenantId = String(formData.get("tenantId") ?? "");
  const moduleKey = String(formData.get("moduleKey") ?? "");
  if (!tenantId || !moduleKey) return { error: t("missingSpaceOrModule") };

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("position") ?? "null"));
  } catch {
    return { error: t("couldNotReadFocal") };
  }
  const parsed = imagePositionSchema.safeParse(raw);
  if (!parsed.success) return { error: t("focalPointNotValid") };

  const { error } = await supabase
    .from("module_configs")
    .update({ image_position: parsed.data })
    .eq("tenant_id", tenantId)
    .eq("module_key", moduleKey);
  if (error) return { error: error.message };

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
  const t = studioMessages(localeFromFormData(formData));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("notLoggedIn"), imageRef: null, imageUrl: null };

  const tenantId = String(formData.get("tenantId") ?? "");
  const kind = String(formData.get("kind") ?? "") as BrandImageKind;
  const previousRef = String(formData.get("previousRef") ?? "") || null;
  const file = formData.get("file");
  if (!tenantId || !(kind in BRAND_IMAGE_COLUMN)) {
    return { error: t("missingSpaceOrImageType"), imageRef: null, imageUrl: null };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { error: t("noFileSelected"), imageRef: null, imageUrl: null };
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { error: t("unsupportedImage"), imageRef: null, imageUrl: null };
  }
  if (!isFileSizeAllowed(file.size)) {
    return { error: t("imageTooLarge"), imageRef: null, imageUrl: null };
  }

  let optimized: Buffer;
  try {
    optimized = await optimizeUploadedImage(file);
  } catch {
    return { error: t("imageNotProcessed"), imageRef: null, imageUrl: null };
  }

  const path = tenantMediaPath(tenantId, "brand", kind, OPTIMIZED_IMAGE_EXTENSION, newUploadId());

  const { data: existing } = await supabase
    .from("brand_configs")
    .select(BRAND_IMAGE_COLUMN[kind])
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const oldDraftRef = ((existing as Record<string, string | null> | null)?.[BRAND_IMAGE_COLUMN[kind]] ?? null) as
    | string
    | null;

  const { error: uploadError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, optimized, { upsert: false, contentType: OPTIMIZED_IMAGE_MIME });
  if (uploadError) return { error: uploadError.message, imageRef: null, imageUrl: null };

  const { data: signed, error: signError } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path, 3600);
  if (signError || !signed) {
    return { error: signError?.message ?? t("uploadedPreviewFailed"), imageRef: path, imageUrl: null };
  }

  const column = BRAND_IMAGE_COLUMN[kind];
  const { error: dbError } = await supabase
    .from("brand_configs")
    .upsert({ tenant_id: tenantId, [column]: path, updated_at: new Date().toISOString() }, { onConflict: "tenant_id" });
  if (dbError) {
    await removeDraftObjects(supabase, tenantId, [path]);
    return { error: dbError.message, imageRef: null, imageUrl: null };
  }

  await removeDraftObjects(supabase, tenantId, [oldDraftRef, previousRef].filter((r) => r !== path));

  return { error: null, imageRef: path, imageUrl: signed.signedUrl };
}

export type RemoveBrandImageState = { error: string | null };

export async function removeBrandImage(
  _prevState: RemoveBrandImageState,
  formData: FormData
): Promise<RemoveBrandImageState> {
  const t = studioMessages(localeFromFormData(formData));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("notLoggedIn") };

  const tenantId = String(formData.get("tenantId") ?? "");
  const kind = String(formData.get("kind") ?? "") as BrandImageKind;
  const imageRef = String(formData.get("imageRef") ?? "");
  if (!imageRef || !tenantId || !(kind in BRAND_IMAGE_COLUMN)) return { error: null };

  const column = BRAND_IMAGE_COLUMN[kind];
  const { data: row } = await supabase.from("brand_configs").select(column).eq("tenant_id", tenantId).maybeSingle();
  const dbRef = ((row as Record<string, string | null> | null)?.[column] ?? null) as string | null;
  const { error } = await supabase.from("brand_configs").update({ [column]: null }).eq("tenant_id", tenantId);
  if (error) return { error: error.message };
  await removeDraftObjects(supabase, tenantId, [imageRef, dbRef]);

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
  const t = studioMessages(localeFromFormData(formData));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("notLoggedIn") };

  const tenantId = String(formData.get("tenantId") ?? "");
  const moduleKey = String(formData.get("moduleKey") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const sortOrder = Number(formData.get("sortOrder") ?? 0);
  if (!tenantId || !moduleKey || !itemId) return { error: t("missingSpaceOrItem") };

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
      title: translate(localeFromFormData(formData), "common", "untitled"),
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
 * before ever saving must clean up the stub row (and its draft photo)
 * rather than leaving an orphan the next Save wouldn't know to
 * delete: Save only replaces rows for items still present in the
 * submitted list, so a since-removed item's row would otherwise persist
 * forever, unreferenced by anything.
 */
export async function deleteModuleItem(
  _prevState: DeleteModuleItemState,
  formData: FormData
): Promise<DeleteModuleItemState> {
  const t = studioMessages(localeFromFormData(formData));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("notLoggedIn") };

  const tenantId = String(formData.get("tenantId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  if (!tenantId || !itemId) return { error: t("missingSpaceOrItem") };

  const { data: row } = await supabase
    .from("module_items")
    .select("image_ref")
    .eq("id", itemId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const { error } = await supabase.from("module_items").delete().eq("id", itemId).eq("tenant_id", tenantId);
  if (error) return { error: error.message };

  // Draft object only, and only after the row is gone. The published copy
  // (which the live snapshot may still reference) is removed by the
  // post-publish sweep once a Publish drops this item.
  await removeDraftObjects(supabase, tenantId, [row?.image_ref as string | null | undefined]);

  return { error: null };
}

export type PublishState = { error: string | null; publishedAt: string | null };

const MEDIA_MODULE_KEYS = [
  "facilitators",
  "meals",
  "treatments",
  "facilities",
  "customPages",
  // TASK 029 - Readings carry a cover image per item, Audio an artwork
  // image AND an audio file (collected separately below, because it
  // lives in metadata.audioRef rather than image_ref).
  FLOW_READINGS_KEY,
  FLOW_AUDIO_KEY,
];

/**
 * The only way anything reaches published_spaces. Calls the
 * publish_space(uuid) database function - one atomic transaction, running
 * as the signed-in owner through the normal RLS-enforcing client, never
 * the admin client. A non-owner's call fails inside the same transaction
 * (RLS on the underlying tables/insert), nothing partially applies either way.
 *
 * Media ordering (TASK 023 - published media is an immutable snapshot):
 *  1. read the CURRENT snapshot's image refs (previousRefs);
 *  2. copy every current draft photo to its published key. Each upload has
 *     its own uploadId folder, so this only ever CREATES objects at new
 *     keys - nothing the live snapshot references is touched, and a
 *     failure here (or in step 3) leaves the previous snapshot and all
 *     its media fully functional;
 *  3. call publish_space(), the single atomic commit of the new snapshot;
 *  4. only after it succeeds, read back the committed snapshot and
 *     best-effort remove published objects it no longer references. A
 *     cleanup failure is logged and never fails the Publish - orphaned
 *     media is acceptable, broken published content is not; the next
 *     successful Publish sweeps any leftovers.
 * publish_space() itself only string-transforms a path for the JSON it
 * writes - it never touches Storage bytes, which is why the copy happens
 * here, before the RPC.
 */
export async function publishSpace(
  _prevState: PublishState,
  formData: FormData
): Promise<PublishState> {
  const t = studioMessages(localeFromFormData(formData));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("notLoggedIn"), publishedAt: null };

  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) return { error: t("missingSpace"), publishedAt: null };

  // This action snapshots Retreat media only. A visible tenant of any other
  // product publishes through its own action (publishSpaceByType dispatches);
  // a tenant that is not visible falls through to the RPC, which rejects it.
  const { data: tenantRow } = await supabase.from("tenants").select("product_type").eq("id", tenantId).maybeSingle();
  if (tenantRow && tenantRow.product_type !== "retreat") {
    return { error: t("cannotPublishFromHere"), publishedAt: null };
  }

  // UX-only pre-check, fails fast before the media Storage work below -
  // the authoritative enforcement is inside publish_space() itself (the
  // RPC call at the end of this function), which cannot be bypassed even
  // if this check were removed or called incorrectly.
  const entitlement = await getSpaceEntitlement(supabase, tenantId);
  const availability = deriveCommercialAvailability(entitlement);
  if (!availability.canPublish) {
    return {
      error: t("needsCommercialAccess"),
      publishedAt: null,
    };
  }

  // The refs the live snapshot references right now - what the post-publish
  // sweep may remove once (and only if) the new snapshot no longer needs
  // them. Unreadable = no precise list; the age-gated orphan sweep still
  // applies.
  const { data: previousSnapshot } = await supabase
    .from("published_spaces")
    .select("modules")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const previousRefs = collectMediaRefs(previousSnapshot?.modules ?? null);

  // Every draft photo reference, across every image-bearing module, the
  // three brand-level refs (Hero/Space/Logo) and module covers - the same
  // draft->published treatment for all of them (see copyDraftToPublished).
  const { data: mediaRows } = await supabase
    .from("module_items")
    .select("image_ref")
    .eq("tenant_id", tenantId)
    .in("module_key", MEDIA_MODULE_KEYS);

  // TASK 029 - audio files. A separate read because the ref lives in
  // metadata.audioRef, and a separate COPY below because audio is copied
  // byte-for-byte (copyDraftAudioToPublished) rather than through the
  // image optimizer.
  const { data: audioRows } = await supabase
    .from("module_items")
    .select("metadata")
    .eq("tenant_id", tenantId)
    .eq("module_key", FLOW_AUDIO_KEY);

  const { data: brandRow } = await supabase
    .from("brand_configs")
    .select("hero_image_ref, space_image_ref, logo_ref")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const { data: moduleCoverRows } = await supabase
    .from("module_configs")
    .select("image_ref")
    .eq("tenant_id", tenantId);

  const draftRefs = new Set<string>();
  for (const ref of [
    ...(mediaRows ?? []).map((r) => r.image_ref as string | null),
    brandRow?.hero_image_ref ?? null,
    brandRow?.space_image_ref ?? null,
    brandRow?.logo_ref ?? null,
    ...(moduleCoverRows ?? []).map((r) => r.image_ref as string | null),
  ]) {
    // A ref that is not this tenant's own draft object is never copied.
    if (ref && isDraftMediaPathForTenant(tenantId, ref)) draftRefs.add(ref);
  }

  // Each copy is independent, so run them concurrently. A failed media
  // copy must never produce a "successful" Publish - Promise.all rejects on
  // the first failure and that rejection stops this function BEFORE the
  // publish_space() RPC. Nothing live has been modified at that point.
  const audioDraftRefs = new Set<string>();
  for (const row of audioRows ?? []) {
    const ref = (row.metadata as { audioRef?: unknown } | null)?.audioRef;
    if (typeof ref === "string" && isDraftMediaPathForTenant(tenantId, ref)) audioDraftRefs.add(ref);
  }

  try {
    await Promise.all([
      ...[...draftRefs].map((ref) => copyDraftToPublished(supabase, ref)),
      ...[...audioDraftRefs].map((ref) => copyDraftAudioToPublished(supabase, ref)),
    ]);
  } catch (err) {
    return {
      error: err instanceof Error ? t("couldNotPublishPhotosWhy", { reason: err.message }) : t("couldNotPublishPhotos"),
      publishedAt: null,
    };
  }

  const { data, error } = await supabase.rpc("publish_space", { p_tenant_id: tenantId });
  if (error) return { error: error.message, publishedAt: null };

  // The new snapshot is committed. Cleanup is strictly post-commit and
  // best-effort; it must never turn a successful Publish into an error.
  try {
    const { data: committed, error: readError } = await supabase
      .from("published_spaces")
      .select("modules")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (readError || !committed) throw new Error(readError?.message ?? "snapshot not readable");
    await cleanupStalePublishedMedia(supabase, tenantId, previousRefs, collectMediaRefs(committed.modules));
  } catch (cleanupError) {
    console.error("publishSpace: stale published media cleanup failed", {
      tenantId,
      message: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
    });
  }

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
  const t = studioMessages(localeFromFormData(formData));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("notLoggedInToSave"), slug: null, tenantId: null };

  let tenantId = String(formData.get("tenantId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? DEFAULT_TIMEZONE);
  const slug = normalizeSlug(String(formData.get("slug") ?? ""));

  if (slugFormatError(slug)) {
    return { error: t("addressNotValid"), slug: null, tenantId: tenantId || null };
  }
  if (isReservedSlug(slug)) {
    return { error: t("addressReserved"), slug: null, tenantId: tenantId || null };
  }

  if (!tenantId) {
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .insert({ name: name || translate(localeFromFormData(formData), "flow", "untitledRetreat"), product_type: "retreat", timezone, slug })
      .select("id")
      .single();
    if (tenantError) {
      if (tenantError.code === "23505") {
        return { error: t("addressJustTaken"), slug: null, tenantId: null };
      }
      return { error: tenantError.message, slug: null, tenantId: null };
    }
    tenantId = tenant.id;
  } else {
    const { error: updateError } = await supabase.from("tenants").update({ slug }).eq("id", tenantId);
    if (updateError) {
      if (updateError.code === "23505") {
        return { error: t("addressJustTaken"), slug: null, tenantId };
      }
      return { error: updateError.message, slug: null, tenantId };
    }
  }

  return { error: null, slug, tenantId };
}

// ---------------------------------------------------------------------
// TASK 029 - Time to Flow content expansion
//
// Everything below writes through the same three patterns the rest of
// this file already uses: module_settings for a singleton,
// saveModuleItemsGeneric for a list, and the three-step audio lifecycle
// Teach established in 0028. Nothing new is invented here.
// ---------------------------------------------------------------------

/**
 * Re-verifies, from the database, that this tenant really is a Retreat.
 *
 * Every action below is reachable by any signed-in member of the tenant,
 * and RLS proves they own it - but not that it is the right product. A
 * Teach Space has its own editors and its own keys; writing Flow content
 * into one would create rows nothing ever publishes.
 */
async function isRetreatTenant(supabase: SupabaseClient, tenantId: string): Promise<boolean> {
  const { data } = await supabase.from("tenants").select("product_type").eq("id", tenantId).maybeSingle();
  return data?.product_type === "retreat";
}

/** The signed-in user plus the client, or null - the preamble every action shares. */
async function retreatActionContext(tenantId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, ok: false as const, reason: "notLoggedIn" as const };
  if (!tenantId) return { supabase, ok: false as const, reason: "missingSpace" as const };
  if (!(await isRetreatTenant(supabase, tenantId))) return { supabase, ok: false as const, reason: "spaceNotFound" as const };
  return { supabase, ok: true as const };
}

export type SaveRetreatProfileState = { error: string | null };

/**
 * Retreat Home's own content - a module_settings singleton, exactly like
 * arrivalInfo.
 *
 * It writes ONLY retreatProfile. The legacy arrivalInfo row is never
 * touched here, which is what makes D3's precedence honest: saving the
 * canonical copy does not delete the organizer's old text, it just stops
 * being the one that is read.
 */
export async function saveRetreatProfile(
  _prevState: SaveRetreatProfileState,
  formData: FormData
): Promise<SaveRetreatProfileState> {
  const t = studioMessages(localeFromFormData(formData));
  const tenantId = String(formData.get("tenantId") ?? "");
  const ctx = await retreatActionContext(tenantId);
  if (!ctx.ok) return { error: t(ctx.reason) };

  let data: unknown;
  try {
    data = JSON.parse(String(formData.get("data") ?? "{}"));
  } catch {
    return { error: t("couldNotReadList") };
  }
  const parsed = retreatProfileSchema.safeParse(data);
  if (!parsed.success) return { error: t("someDetailsInvalid") };

  const { error } = await ctx.supabase.from("module_settings").upsert(
    {
      tenant_id: tenantId,
      module_key: RETREAT_PROFILE_KEY,
      data: parsed.data,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,module_key" }
  );
  if (error) return { error: error.message };
  return { error: null };
}

export type SaveModuleIntrosState = { error: string | null };

/**
 * The generic module introductions (TASK 029, decision 2).
 *
 * Pruned before writing, so clearing the only intro stores `{}` - which
 * publish_space() then does not emit at all, returning the published
 * payload to exactly the shape it had before anyone typed anything.
 */
export async function saveModuleIntros(
  _prevState: SaveModuleIntrosState,
  formData: FormData
): Promise<SaveModuleIntrosState> {
  const t = studioMessages(localeFromFormData(formData));
  const tenantId = String(formData.get("tenantId") ?? "");
  const ctx = await retreatActionContext(tenantId);
  if (!ctx.ok) return { error: t(ctx.reason) };

  let data: unknown;
  try {
    data = JSON.parse(String(formData.get("data") ?? "{}"));
  } catch {
    return { error: t("couldNotReadList") };
  }
  const parsed = moduleIntrosSchema.safeParse(data);
  if (!parsed.success) return { error: t("someDetailsInvalid") };

  const { error } = await ctx.supabase.from("module_settings").upsert(
    {
      tenant_id: tenantId,
      module_key: MODULE_INTROS_KEY,
      data: pruneModuleIntros(parsed.data),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,module_key" }
  );
  if (error) return { error: error.message };
  return { error: null };
}

export type SaveGuidelinesState = SaveModuleItemsState;

export async function saveGuidelines(
  _prevState: SaveGuidelinesState,
  formData: FormData
): Promise<SaveGuidelinesState> {
  const t = studioMessages(localeFromFormData(formData));
  const tenantId = String(formData.get("tenantId") ?? "");
  const ctx = await retreatActionContext(tenantId);
  if (!ctx.ok) return { error: t(ctx.reason) };

  const parsed = parseItemsWithIds(formData, guidelineSchema);
  if ("error" in parsed) return { error: parsed.error };

  const rows = parsed.data.map((item, i) => ({
    id: item.id,
    tenant_id: tenantId,
    module_key: GUIDELINES_KEY,
    title: item.title,
    subtitle: null,
    description: item.description,
    sort_order: i,
    metadata: {},
  }));
  return saveModuleItemsGeneric(ctx.supabase, tenantId, GUIDELINES_KEY, rows);
}

export type SaveDailyInspirationState = SaveModuleItemsState;

/**
 * TASK 030 W1.5. Same shape as saveFaq: the text is `description`, the
 * optional label is `title` (NOT NULL in the table, so "" when absent),
 * and metadata.enabled is rebuilt from the full parsed item on every save
 * so it can never be dropped by a partial write. Saved to the DRAFT rows;
 * guests see nothing until Republish.
 */
export async function saveDailyInspiration(
  _prevState: SaveDailyInspirationState,
  formData: FormData
): Promise<SaveDailyInspirationState> {
  const t = studioMessages(localeFromFormData(formData));
  const tenantId = String(formData.get("tenantId") ?? "");
  const ctx = await retreatActionContext(tenantId);
  if (!ctx.ok) return { error: t(ctx.reason) };

  const parsed = parseItemsWithIds(formData, inspirationItemSchema);
  if ("error" in parsed) return { error: parsed.error };

  const rows = parsed.data.map((item, i) => ({
    id: item.id,
    tenant_id: tenantId,
    module_key: DAILY_INSPIRATION_KEY,
    title: item.label.trim(),
    subtitle: null,
    description: item.text,
    sort_order: i,
    metadata: { enabled: item.enabled },
  }));
  return saveModuleItemsGeneric(ctx.supabase, tenantId, DAILY_INSPIRATION_KEY, rows);
}

/** The envelope a Readings/Audio row is validated against on write. */
const readingItemSchema = libraryItemFieldsSchema(readingMetadataSchema, true);
const flowAudioItemSchema = libraryItemFieldsSchema(flowAudioMetadataSchema, true);

export type SaveReadingsState = SaveModuleItemsState;

export async function saveReadings(
  _prevState: SaveReadingsState,
  formData: FormData
): Promise<SaveReadingsState> {
  const t = studioMessages(localeFromFormData(formData));
  const tenantId = String(formData.get("tenantId") ?? "");
  const ctx = await retreatActionContext(tenantId);
  if (!ctx.ok) return { error: t(ctx.reason) };

  const parsed = parseItemsWithIds(formData, readingItemSchema);
  if ("error" in parsed) return { error: parsed.error };

  const rows = parsed.data.map((item, i) => ({
    id: item.id,
    tenant_id: tenantId,
    module_key: FLOW_READINGS_KEY,
    title: item.title ?? "",
    subtitle: item.subtitle,
    description: item.description,
    external_link: item.externalLink,
    sort_order: i,
    metadata: item.metadata as unknown as Record<string, unknown>,
  }));
  return saveModuleItemsGeneric(ctx.supabase, tenantId, FLOW_READINGS_KEY, rows);
}

export type SaveFlowAudioState = SaveModuleItemsState;

/**
 * Audio's text fields. The FILE is not written here, for the same reason
 * Save never writes image_ref: an upload finishing mid-save must not be
 * reverted by a stale client snapshot. `audioRef` and `durationSeconds`
 * are owned by attachFlowAudio/detachFlowAudio and are carried over from
 * the row that is already in the database.
 */
export async function saveFlowAudio(
  _prevState: SaveFlowAudioState,
  formData: FormData
): Promise<SaveFlowAudioState> {
  const t = studioMessages(localeFromFormData(formData));
  const tenantId = String(formData.get("tenantId") ?? "");
  const ctx = await retreatActionContext(tenantId);
  if (!ctx.ok) return { error: t(ctx.reason) };

  const parsed = parseItemsWithIds(formData, flowAudioItemSchema);
  if ("error" in parsed) return { error: parsed.error };

  const { data: existing } = await ctx.supabase
    .from("module_items")
    .select("id, metadata")
    .eq("tenant_id", tenantId)
    .eq("module_key", FLOW_AUDIO_KEY);
  const fileByItem = new Map<string, { audioRef: unknown; durationSeconds: unknown }>();
  for (const row of existing ?? []) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    fileByItem.set(row.id, { audioRef: meta.audioRef ?? null, durationSeconds: meta.durationSeconds ?? null });
  }

  const rows = parsed.data.map((item, i) => {
    const file = fileByItem.get(item.id);
    return {
      id: item.id,
      tenant_id: tenantId,
      module_key: FLOW_AUDIO_KEY,
      title: item.title ?? "",
      subtitle: item.subtitle,
      description: item.description,
      external_link: item.externalLink,
      sort_order: i,
      metadata: {
        ...(item.metadata as unknown as Record<string, unknown>),
        audioRef: file?.audioRef ?? null,
        durationSeconds: file?.durationSeconds ?? null,
      },
    };
  });
  return saveModuleItemsGeneric(ctx.supabase, tenantId, FLOW_AUDIO_KEY, rows);
}

// ---------------------------------------------------------------------
// Flow audio file lifecycle - the same three steps as Teach's (0028):
//   1. prepareFlowAudioUpload: validate type/size, make sure the row
//      exists BEFORE any bytes land, hand back a brand-new versioned
//      path. The client uploads with upsert:false, so nothing is ever
//      overwritten.
//   2. attachFlowAudio: verify what actually landed from Storage's own
//      metadata (the real server-side limit), point the row at it, and
//      only THEN remove the one draft it replaced.
//   3. detachFlowAudio: clear the reference, then remove that one draft.
// published.* copies are never touched here - publish creates them and
// the post-publish sweep removes the ones no longer referenced.
// ---------------------------------------------------------------------

async function loadFlowAudioRow(supabase: SupabaseClient, tenantId: string, itemId: string) {
  const { data } = await supabase
    .from("module_items")
    .select("id, module_key, metadata")
    .eq("tenant_id", tenantId)
    .eq("id", itemId);
  return (data?.[0] ?? null) as { id: string; module_key: string; metadata: Record<string, unknown> | null } | null;
}

const currentFlowAudioRef = (row: { metadata: Record<string, unknown> | null } | null): string | null => {
  const ref = row?.metadata?.audioRef;
  return typeof ref === "string" ? ref : null;
};

export type FlowAudioUploadState = { error: string | null; path: string | null };
export type FlowAudioState = { error: string | null };

export async function prepareFlowAudioUpload(
  tenantId: string,
  item: unknown,
  sortOrder: number,
  mimeType: string,
  sizeBytes: number,
  locale: Locale = DEFAULT_LOCALE
): Promise<FlowAudioUploadState> {
  const t = studioMessages(locale);
  const fail = (error: string): FlowAudioUploadState => ({ error, path: null });
  const ctx = await retreatActionContext(tenantId);
  if (!ctx.ok) return fail(t(ctx.reason));

  const itemId = (item as { id?: unknown } | null)?.id;
  if (typeof itemId !== "string" || !z.string().uuid().safeParse(itemId).success) return fail(t("missingItem"));
  const ext = typeof mimeType === "string" ? AUDIO_ALLOWED_TYPES[normalizeMimeType(mimeType)] : undefined;
  if (!ext) return fail(t("unsupportedAudio"));
  if (!isAudioSizeAllowed(sizeBytes)) return fail(t("audioTooLarge", { limit: MAX_AUDIO_BYTES / (1024 * 1024) }));

  const existing = await loadFlowAudioRow(ctx.supabase, tenantId, itemId);
  if (existing && existing.module_key !== FLOW_AUDIO_KEY) return fail(t("missingItem"));
  if (!existing) {
    const raw = item as Record<string, unknown>;
    const parsed = flowAudioItemSchema.safeParse({
      ...raw,
      title: String(raw.title ?? "").trim() || t("untitledAudio"),
    });
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? t("someDetailsInvalid"));
    const { error } = await ctx.supabase.from("module_items").insert({
      id: itemId,
      tenant_id: tenantId,
      module_key: FLOW_AUDIO_KEY,
      title: parsed.data.title ?? t("untitledAudio"),
      subtitle: parsed.data.subtitle,
      description: parsed.data.description,
      external_link: parsed.data.externalLink,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
      // The file is not attached until attachFlowAudio confirms the upload.
      metadata: { ...(parsed.data.metadata as unknown as Record<string, unknown>), audioRef: null, durationSeconds: null },
    });
    if (error) return fail(error.message);
  }
  return {
    error: null,
    path: versionedMediaPath("draft", {
      tenantId,
      moduleKey: FLOW_AUDIO_FOLDER_KEY,
      itemId,
      uploadId: newUploadId(),
      ext,
    }),
  };
}

export async function attachFlowAudio(
  tenantId: string,
  itemId: string,
  ref: string,
  durationSeconds: number | null,
  locale: Locale = DEFAULT_LOCALE
): Promise<FlowAudioState> {
  const t = studioMessages(locale);
  const ctx = await retreatActionContext(tenantId);
  if (!ctx.ok) return { error: t(ctx.reason) };
  if (!z.string().uuid().safeParse(itemId).success) return { error: t("missingItem") };

  const parts = typeof ref === "string" ? parseAudioDraftRef(ref) : null;
  if (!parts || parts.tenantId !== tenantId || parts.moduleKey !== FLOW_AUDIO_FOLDER_KEY || parts.itemId !== itemId) {
    return { error: t("audioRefInvalid") };
  }
  const row = await loadFlowAudioRow(ctx.supabase, tenantId, itemId);
  if (!row || row.module_key !== FLOW_AUDIO_KEY) return { error: t("missingItem") };
  const previousRef = currentFlowAudioRef(row);
  const duration =
    typeof durationSeconds === "number" &&
    Number.isFinite(durationSeconds) &&
    durationSeconds >= 0 &&
    durationSeconds <= 60 * 60 * 12
      ? Math.round(durationSeconds)
      : null;

  // The upload went browser -> Storage, so the real limits are enforced
  // here against what Storage actually holds. A rejected NEW upload is
  // removed: it is unreferenced, so nothing else points at it.
  const bucket = ctx.supabase.storage.from(MEDIA_BUCKET);
  const reject = async (message: string): Promise<FlowAudioState> => {
    if (ref !== previousRef) await removeDraftObjects(ctx.supabase, tenantId, [ref]);
    return { error: message };
  };
  const { data: info, error: infoError } = await bucket.info(ref);
  if (infoError || !info) return { error: t("uploadDidNotFinish") };
  if (!isAudioSizeAllowed(Number(info.size))) {
    return reject(t("audioTooLarge", { limit: MAX_AUDIO_BYTES / (1024 * 1024) }));
  }
  if (AUDIO_ALLOWED_TYPES[normalizeMimeType(String(info.contentType ?? ""))] !== parts.ext) {
    return reject(t("unsupportedAudio"));
  }

  if (ref !== previousRef) {
    // A published object already in this upload's folder means this is
    // not a fresh upload; refuse the folder rather than risk replacing
    // what the live snapshot may still reference.
    const published = versionedMediaPath("published", { ...parts });
    const { data: publishedExists } = await bucket.exists(published);
    if (publishedExists) return { error: t("audioRefInvalidReupload") };
  }

  const { error } = await ctx.supabase
    .from("module_items")
    .update({ metadata: { ...(row.metadata ?? {}), audioRef: ref, durationSeconds: duration } })
    .eq("tenant_id", tenantId)
    .eq("id", itemId);
  if (error) {
    if (ref !== previousRef) await removeDraftObjects(ctx.supabase, tenantId, [ref]);
    return { error: error.message };
  }
  if (previousRef && previousRef !== ref) await removeDraftObjects(ctx.supabase, tenantId, [previousRef]);
  return { error: null };
}

export async function detachFlowAudio(
  tenantId: string,
  itemId: string,
  locale: Locale = DEFAULT_LOCALE
): Promise<FlowAudioState> {
  const t = studioMessages(locale);
  const ctx = await retreatActionContext(tenantId);
  if (!ctx.ok) return { error: t(ctx.reason) };
  if (!z.string().uuid().safeParse(itemId).success) return { error: t("missingItem") };

  const row = await loadFlowAudioRow(ctx.supabase, tenantId, itemId);
  if (!row) return { error: null };
  if (row.module_key !== FLOW_AUDIO_KEY) return { error: t("missingItem") };
  const previousRef = currentFlowAudioRef(row);
  const { error } = await ctx.supabase
    .from("module_items")
    .update({ metadata: { ...(row.metadata ?? {}), audioRef: null, durationSeconds: null } })
    .eq("tenant_id", tenantId)
    .eq("id", itemId);
  if (error) return { error: error.message };
  await removeDraftObjects(ctx.supabase, tenantId, [previousRef]);
  return { error: null };
}

export type { OptionalModuleKey };
