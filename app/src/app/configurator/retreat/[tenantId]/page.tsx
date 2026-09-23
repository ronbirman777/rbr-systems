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
import type { EditableFaqItem } from "@/lib/modules/faq";
import type { EditableCustomPage } from "@/lib/modules/customPage";
import { EMPTY_STAY_CONNECTED, type StayConnected } from "@/lib/modules/stayConnected";
import { socialLinksSchema } from "@/lib/modules/socialLinks";
import type { OptionalModuleKey } from "@/lib/modules/catalog";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";
import { MEDIA_BUCKET, publicMediaUrl } from "@/lib/media/path";
import { mapBrandRowToInitialProps } from "@/lib/theme/brandRowMapping";
import { brandMediaSchema } from "@/lib/modules/publishedTheme";
import { isSpacePubliclyAvailable } from "@/lib/entitlements/isSpacePubliclyAvailable";
import { getGuestAccessSettingsForOwner } from "../guestAccessActions";
import { getFeaturedSubmissionForOwner } from "../featuredActions";
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
  searchParams,
}: {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const { tenantId } = await params;
  const { step } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/log-in");

  // RLS scopes this to tenants the signed-in user is a member of - a draft
  // belonging to someone else simply won't come back, regardless of the id.
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name, timezone, slug")
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenant) notFound();

  // PRE-MIGRATION WARNING: custom_navigation/custom_text (0015) and
  // custom_secondary/hero_image_ref/space_image_ref/logo_ref (0014) must
  // all exist on the same database this code runs against - this select
  // will error for every tenant, breaking this entire page, otherwise.
  // Intentional coupling, not an oversight - do not deploy this code
  // ahead of whichever of those migrations hasn't applied yet.
  // Task 011 (item C, Space-opening performance): these 12 reads are all
  // independent of one another - every one of them is filtered by
  // tenantId alone, none consumes another's result - so there is no
  // correctness reason for them to run as 12 sequential round trips.
  // Measured locally (Playwright + local Supabase, zero network latency)
  // this page's own RSC fetch was the dominant cost in the "tap a Space ->
  // Studio usable" path; in Production, with real per-request network
  // latency, serial round trips like this compound linearly while
  // Promise.all lets them run concurrently, bounded by the single slowest
  // query instead of their sum. See 011/evidence/performance-investigation.md.
  const [
    { data: brand },
    { data: scheduleRows },
    { data: facilitatorRows },
    { data: mealRows },
    { data: treatmentRows },
    { data: facilityRows },
    { data: faqRows },
    { data: customPageRows },
    { data: arrivalRow },
    { data: stayConnectedRow },
    { data: moduleConfigRows },
    { data: published },
  ] = await Promise.all([
    // PRE-MIGRATION WARNING: custom_navigation/custom_text (0015) and
    // custom_secondary/hero_image_ref/space_image_ref/logo_ref (0014) must
    // all exist on the same database this code runs against - this select
    // will error for every tenant, breaking this entire page, otherwise.
    // Intentional coupling, not an oversight - do not deploy this code
    // ahead of whichever of those migrations hasn't applied yet.
    supabase
      .from("brand_configs")
      .select(
        "palette, atmosphere, custom_primary, custom_secondary, custom_navigation, custom_text, hero_image_ref, space_image_ref, logo_ref"
      )
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    supabase
      .from("schedule_items")
      .select("id, date, start_time, end_time, title, facilitator, location, description, category")
      .eq("tenant_id", tenantId)
      .order("date")
      .order("start_time"),
    supabase
      .from("module_items")
      .select("id, title, subtitle, description, image_ref, metadata")
      .eq("tenant_id", tenantId)
      .eq("module_key", "facilitators")
      .order("sort_order"),
    supabase
      .from("module_items")
      .select("id, title, description, image_ref, metadata")
      .eq("tenant_id", tenantId)
      .eq("module_key", "meals")
      .order("sort_order"),
    supabase
      .from("module_items")
      .select("id, title, subtitle, description, image_ref, metadata")
      .eq("tenant_id", tenantId)
      .eq("module_key", "treatments")
      .order("sort_order"),
    supabase
      .from("module_items")
      .select("id, title, description, image_ref, metadata")
      .eq("tenant_id", tenantId)
      .eq("module_key", "facilities")
      .order("sort_order"),
    supabase
      .from("module_items")
      .select("id, title, description, metadata")
      .eq("tenant_id", tenantId)
      .eq("module_key", "faq")
      .order("sort_order"),
    supabase
      .from("module_items")
      .select("id, title, description, image_ref, metadata")
      .eq("tenant_id", tenantId)
      .eq("module_key", "customPages")
      .order("sort_order"),
    supabase
      .from("module_settings")
      .select("data")
      .eq("tenant_id", tenantId)
      .eq("module_key", "arrivalInfo")
      .maybeSingle(),
    supabase
      .from("module_settings")
      .select("data")
      .eq("tenant_id", tenantId)
      .eq("module_key", "stayConnected")
      .maybeSingle(),
    supabase.from("module_configs").select("module_key, enabled").eq("tenant_id", tenantId),
    supabase.from("published_spaces").select("published_at, modules").eq("tenant_id", tenantId).maybeSingle(),
  ]);

  // Share Your Space's Share Card needs the PUBLISHED Hero image, not the
  // draft one - reused verbatim from how the Guest App itself resolves it
  // (brandMediaSchema + publicMediaUrl, same as published-space-screen.tsx)
  // so this is exactly what a guest already sees, never a new exposure or
  // a new Storage copy.
  const publishedBrandMediaParsed = brandMediaSchema.safeParse(published?.modules && (published.modules as { brand?: unknown }).brand);
  const publishedHeroImageRef = publishedBrandMediaParsed.success ? (publishedBrandMediaParsed.data.hero?.imageRef ?? null) : null;
  const publishedHeroImageUrl = publishedHeroImageRef ? publicMediaUrl(publishedHeroImageRef) : null;

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

  // Task 011 (item C): these five module transforms are independent of
  // each other (each reads only its own already-fetched rows above) but
  // each also does its own per-item signed-URL resolution internally, so
  // they were previously five separate serial Promise.all blocks, one
  // fully finishing before the next began. Running the five blocks
  // themselves in parallel (each still internally parallel over its own
  // rows, unchanged) removes that serialization too.
  const initialFaq: EditableFaqItem[] = (faqRows ?? []).map((r) => {
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    return {
      id: r.id,
      question: r.title,
      answer: r.description,
      enabled: typeof meta.enabled === "boolean" ? meta.enabled : true,
    };
  });

  const [initialFacilitators, initialMeals, initialTreatments, initialFacilities, initialCustomPages]: [
    EditableFacilitator[],
    EditableMeal[],
    EditableTreatment[],
    EditableFacility[],
    EditableCustomPage[],
  ] = await Promise.all([
    Promise.all(
      (facilitatorRows ?? []).map(async (r) => {
        const meta = (r.metadata ?? {}) as Record<string, unknown>;
        const socialLinksParsed = socialLinksSchema.safeParse(meta.socialLinks);
        const pos = meta.imagePosition as { x?: unknown; y?: unknown } | null | undefined;
        const imagePosition =
          pos && typeof pos.x === "number" && typeof pos.y === "number" && pos.x >= 0 && pos.x <= 100 && pos.y >= 0 && pos.y <= 100
            ? { x: pos.x, y: pos.y }
            : null;
        return {
          id: r.id,
          name: r.title,
          role: r.subtitle,
          bio: r.description,
          imageRef: r.image_ref,
          imageUrl: await resolveImageUrl(supabase, r.image_ref),
          specialties: Array.isArray(meta.specialties) ? (meta.specialties as string[]) : [],
          socialLinks: socialLinksParsed.success ? socialLinksParsed.data : [],
          imagePosition,
        };
      })
    ),
    Promise.all(
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
    ),
    Promise.all(
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
    ),
    Promise.all(
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
    ),
    Promise.all(
      (customPageRows ?? []).map(async (r) => {
        const meta = (r.metadata ?? {}) as Record<string, unknown>;
        return {
          id: r.id,
          title: r.title,
          body: r.description,
          imageRef: r.image_ref,
          imageUrl: await resolveImageUrl(supabase, r.image_ref),
          enabled: typeof meta.enabled === "boolean" ? meta.enabled : true,
        };
      })
    ),
  ]);

  const arrivalParsed = arrivalRow?.data ? arrivalInfoSchema.safeParse(arrivalRow.data) : null;
  const initialArrivalInfo: ArrivalInfo = arrivalParsed?.success ? arrivalParsed.data : EMPTY_ARRIVAL_INFO;

  const stayConnectedParsed = stayConnectedRow?.data
    ? socialLinksSchema.safeParse((stayConnectedRow.data as { links?: unknown }).links)
    : null;
  const initialStayConnected: StayConnected = stayConnectedParsed?.success
    ? { links: stayConnectedParsed.data }
    : EMPTY_STAY_CONNECTED;

  const initialEnabledModules = (moduleConfigRows ?? [])
    .filter((r) => r.enabled)
    .map((r) => r.module_key as OptionalModuleKey);

  // Task 011 (item C): none of these six depend on each other's result -
  // the three status/settings lookups only need tenant.id (known since
  // the very first query above), and the three signed-URL resolutions
  // only need `brand` (already available). Previously six more
  // sequential awaits; now one parallel phase.
  const [
    initialIsPubliclyAvailable,
    initialGuestAccessSettings,
    initialFeaturedSubmission,
    initialHeroImageUrl,
    initialSpaceImageUrl,
    initialLogoUrl,
  ] = await Promise.all([
    published?.published_at ? isSpacePubliclyAvailable(tenant.id) : Promise.resolve(false),
    getGuestAccessSettingsForOwner(tenant.id),
    getFeaturedSubmissionForOwner(tenant.id),
    resolveImageUrl(supabase, brand?.hero_image_ref ?? null),
    resolveImageUrl(supabase, brand?.space_image_ref ?? null),
    resolveImageUrl(supabase, brand?.logo_ref ?? null),
  ]);
  const brandInitial = mapBrandRowToInitialProps(brand);

  return (
    <main className="flex-1 flex flex-col min-h-0 bg-idw-parchment">
      <RetreatConfigurator
        initialTenantId={tenant.id}
        initialName={tenant.name}
        initialSlug={tenant.slug ?? null}
        initialStep={step === "publish" ? "publish" : undefined}
        initialTimezone={tenant.timezone ?? DEFAULT_TIMEZONE}
        initialPalette={brandInitial.initialPalette as PaletteKey}
        initialAtmosphere={brandInitial.initialAtmosphere as AtmosphereKey}
        initialCustomPrimary={brandInitial.initialCustomPrimary}
        initialCustomSecondary={brandInitial.initialCustomSecondary}
        initialCustomNavigation={brandInitial.initialCustomNavigation}
        initialCustomText={brandInitial.initialCustomText}
        initialHeroImageRef={brandInitial.initialHeroImageRef}
        initialHeroImageUrl={initialHeroImageUrl}
        initialSpaceImageRef={brandInitial.initialSpaceImageRef}
        initialSpaceImageUrl={initialSpaceImageUrl}
        initialLogoRef={brandInitial.initialLogoRef}
        initialLogoUrl={initialLogoUrl}
        initialSchedule={initialSchedule}
        initialFacilitators={initialFacilitators}
        initialMeals={initialMeals}
        initialTreatments={initialTreatments}
        initialFacilities={initialFacilities}
        initialArrivalInfo={initialArrivalInfo}
        initialFaq={initialFaq}
        initialCustomPages={initialCustomPages}
        initialStayConnected={initialStayConnected}
        initialEnabledModules={initialEnabledModules}
        initialPublishedAt={published?.published_at ?? null}
        initialIsPubliclyAvailable={initialIsPubliclyAvailable}
        initialGuestAccessSettings={initialGuestAccessSettings}
        initialFeaturedSubmission={initialFeaturedSubmission}
        publishedHeroImageUrl={publishedHeroImageUrl}
      />
    </main>
  );
}
