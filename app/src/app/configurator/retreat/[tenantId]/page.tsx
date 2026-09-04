import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RetreatConfigurator } from "../retreat-configurator";
import type { AtmosphereKey, PaletteKey } from "@/lib/theme/tokens";
import type { EditableScheduleItem } from "@/lib/schedule/types";
import type { EditableFacilitator } from "@/lib/modules/facilitator";
import type { EditableMeal, MealType } from "@/lib/modules/meal";
import type { EditableTreatment } from "@/lib/modules/treatment";
import type { EditableFacility } from "@/lib/modules/facility";
import { arrivalInfoSchema, EMPTY_ARRIVAL_INFO, type ArrivalInfo } from "@/lib/modules/arrival";
import type { OptionalModuleKey } from "@/lib/modules/catalog";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";
import { MEDIA_BUCKET } from "@/lib/media/path";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Signed preview URLs are resolved server-side, through the same
 * RLS-scoped session as everything else on this page - the organizer can
 * only ever get a signed URL for their own tenant's objects. */
async function resolveImageUrl(supabase: SupabaseClient, imageRef: string | null): Promise<string | null> {
  if (!imageRef) return null;
  const { data: signed } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(imageRef, 3600);
  return signed?.signedUrl ?? null;
}

export default async function ResumeRetreatConfiguratorPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/log-in");

  // RLS scopes this to tenants the signed-in user is a member of - a draft
  // belonging to someone else simply won't come back, regardless of the id.
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name, timezone")
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenant) notFound();

  const { data: brand } = await supabase
    .from("brand_configs")
    .select("palette, atmosphere")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const { data: scheduleRows } = await supabase
    .from("schedule_items")
    .select("id, date, start_time, end_time, title, facilitator, location, description, category")
    .eq("tenant_id", tenantId)
    .order("date")
    .order("start_time");

  const { data: facilitatorRows } = await supabase
    .from("module_items")
    .select("id, title, subtitle, description, image_ref")
    .eq("tenant_id", tenantId)
    .eq("module_key", "facilitators")
    .order("sort_order");

  const { data: mealRows } = await supabase
    .from("module_items")
    .select("id, title, description, image_ref, metadata")
    .eq("tenant_id", tenantId)
    .eq("module_key", "meals")
    .order("sort_order");

  const { data: treatmentRows } = await supabase
    .from("module_items")
    .select("id, title, subtitle, description, image_ref, metadata")
    .eq("tenant_id", tenantId)
    .eq("module_key", "treatments")
    .order("sort_order");

  const { data: facilityRows } = await supabase
    .from("module_items")
    .select("id, title, description, image_ref, metadata")
    .eq("tenant_id", tenantId)
    .eq("module_key", "facilities")
    .order("sort_order");

  const { data: arrivalRow } = await supabase
    .from("module_settings")
    .select("data")
    .eq("tenant_id", tenantId)
    .eq("module_key", "arrivalInfo")
    .maybeSingle();

  const { data: moduleConfigRows } = await supabase
    .from("module_configs")
    .select("module_key, enabled")
    .eq("tenant_id", tenantId);

  const { data: published } = await supabase
    .from("published_spaces")
    .select("published_at")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const initialSchedule: EditableScheduleItem[] = (scheduleRows ?? []).map((r) => ({
    id: r.id,
    date: r.date,
    startTime: (r.start_time ?? "").slice(0, 5),
    endTime: r.end_time ? r.end_time.slice(0, 5) : null,
    title: r.title,
    facilitator: r.facilitator,
    location: r.location,
    description: r.description,
    category: r.category,
  }));

  const initialFacilitators: EditableFacilitator[] = await Promise.all(
    (facilitatorRows ?? []).map(async (r) => ({
      id: r.id,
      name: r.title,
      role: r.subtitle,
      bio: r.description,
      imageRef: r.image_ref,
      imageUrl: await resolveImageUrl(supabase, r.image_ref),
    }))
  );

  const initialMeals: EditableMeal[] = await Promise.all(
    (mealRows ?? []).map(async (r) => {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      return {
        id: r.id,
        name: r.title,
        mealType: (meta.mealType as MealType) ?? "other",
        startTime: (meta.startTime as string) ?? "08:00",
        endTime: (meta.endTime as string | null) ?? null,
        description: r.description,
        imageRef: r.image_ref,
        imageUrl: await resolveImageUrl(supabase, r.image_ref),
        dietaryTags: (meta.dietaryTags as string[]) ?? [],
        location: (meta.location as string | null) ?? null,
      };
    })
  );

  const initialTreatments: EditableTreatment[] = await Promise.all(
    (treatmentRows ?? []).map(async (r) => {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      return {
        id: r.id,
        name: r.title,
        shortDescription: r.subtitle,
        description: r.description,
        durationMinutes: (meta.durationMinutes as number | null) ?? null,
        imageRef: r.image_ref,
        imageUrl: await resolveImageUrl(supabase, r.image_ref),
        provider: (meta.provider as string | null) ?? null,
        location: (meta.location as string | null) ?? null,
        bookingInfo: (meta.bookingInfo as string | null) ?? null,
      };
    })
  );

  const initialFacilities: EditableFacility[] = await Promise.all(
    (facilityRows ?? []).map(async (r) => {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      return {
        id: r.id,
        name: r.title,
        description: r.description,
        imageRef: r.image_ref,
        imageUrl: await resolveImageUrl(supabase, r.image_ref),
        openingHours: (meta.openingHours as string | null) ?? null,
        location: (meta.location as string | null) ?? null,
        importantInfo: (meta.importantInfo as string | null) ?? null,
      };
    })
  );

  const arrivalParsed = arrivalRow?.data ? arrivalInfoSchema.safeParse(arrivalRow.data) : null;
  const initialArrivalInfo: ArrivalInfo = arrivalParsed?.success ? arrivalParsed.data : EMPTY_ARRIVAL_INFO;

  const initialEnabledModules = (moduleConfigRows ?? [])
    .filter((r) => r.enabled)
    .map((r) => r.module_key as OptionalModuleKey);

  return (
    <main className="flex-1 flex flex-col min-h-0 bg-idw-parchment">
      <RetreatConfigurator
        initialTenantId={tenant.id}
        initialName={tenant.name}
        initialTimezone={tenant.timezone ?? DEFAULT_TIMEZONE}
        initialPalette={(brand?.palette as PaletteKey) ?? "forest-sage"}
        initialAtmosphere={(brand?.atmosphere as AtmosphereKey) ?? "calm-organic"}
        initialSchedule={initialSchedule}
        initialFacilitators={initialFacilitators}
        initialMeals={initialMeals}
        initialTreatments={initialTreatments}
        initialFacilities={initialFacilities}
        initialArrivalInfo={initialArrivalInfo}
        initialEnabledModules={initialEnabledModules}
        initialPublishedAt={published?.published_at ?? null}
      />
    </main>
  );
}
