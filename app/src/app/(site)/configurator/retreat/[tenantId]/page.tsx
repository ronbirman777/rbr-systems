import { loadStudioTenant } from "@/lib/configurator/studioTenant";
import { RetreatConfigurator } from "../retreat-configurator";
import type { AtmosphereKey, PaletteKey } from "@/lib/theme/tokens";
import { activityExtrasSchema, type EditableScheduleItem } from "@/lib/schedule/types";
import type { EditableFacilitator } from "@/lib/modules/facilitator";
import type { EditableMeal, MealType } from "@/lib/modules/meal";
import { CHARGE_TYPES, type ChargeType, type EditableTreatment } from "@/lib/modules/treatment";
import type { EditableFacility } from "@/lib/modules/facility";
import { arrivalInfoSchema, EMPTY_ARRIVAL_INFO, type ArrivalInfo } from "@/lib/modules/arrival";
import type { EditableFaqItem } from "@/lib/modules/faq";
import type { EditableCustomPage } from "@/lib/modules/customPage";
import { EMPTY_STAY_CONNECTED, type StayConnected } from "@/lib/modules/stayConnected";
import {
  retreatProfileSchema,
  EMPTY_RETREAT_PROFILE,
  RETREAT_PROFILE_KEY,
  type RetreatProfile,
} from "@/lib/modules/retreatProfile";
import {
  moduleIntrosSchema,
  EMPTY_MODULE_INTROS,
  MODULE_INTROS_KEY,
  type ModuleIntros,
} from "@/lib/modules/moduleIntro";
import { GUIDELINES_KEY, type EditableGuideline } from "@/lib/modules/guideline";
import { DAILY_INSPIRATION_KEY, type EditableInspirationItem } from "@/lib/modules/dailyInspiration";
import {
  FLOW_AUDIO_KEY,
  FLOW_READINGS_KEY,
  flowAudioMetadataSchema,
  EMPTY_FLOW_AUDIO_METADATA,
  EMPTY_READING_METADATA,
  type EditableFlowReading,
  type EditableFlowTrack,
} from "@/lib/modules/flowLibrary";
import { readingMetadataSchema } from "@/lib/modules/library";
import { socialLinksSchema } from "@/lib/modules/socialLinks";
import { parseImagePosition, type ImagePosition } from "@/lib/modules/imagePosition";
import type { OptionalModuleKey } from "@/lib/modules/catalog";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";
import { MEDIA_BUCKET, publicMediaUrl } from "@/lib/media/path";
import { mapBrandRowToInitialProps } from "@/lib/theme/brandRowMapping";
import { brandMediaSchema } from "@/lib/modules/publishedTheme";
import { isSpacePubliclyAvailable } from "@/lib/entitlements/isSpacePubliclyAvailable";
import { getGuestAccessSettingsForOwner } from "../guestAccessActions";
import { getFeaturedSubmissionForOwner } from "../featuredActions";
import type { SupabaseClient } from "@supabase/supabase-js";

import { SPACE_SETTINGS_KEY, parseSpaceSettings } from "@/lib/spaceSettings";
import { DEFAULT_LOCALE } from "@/lib/i18n";
/** Signed preview URLs are resolved server-side, through the same
 * RLS-scoped session as everything else on this page - the organizer can
 * only ever get a signed URL for their own tenant's objects. */
function parseChargeType(raw: unknown): ChargeType | null {
  return typeof raw === "string" && (CHARGE_TYPES as readonly string[]).includes(raw) ? (raw as ChargeType) : null;
}

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
  const { supabase, tenant } = await loadStudioTenant(tenantId, "retreat");

  // PRE-MIGRATION WARNING: custom_surface (0032), custom_navigation/
  // custom_text (0015) and custom_secondary/hero_image_ref/
  // space_image_ref/logo_ref (0014) must all exist on the same database
  // this code runs against - this select will error for every tenant,
  // breaking this entire page, otherwise. Intentional coupling, not an
  // oversight - do not deploy this code ahead of whichever of those
  // migrations hasn't applied yet.
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
    { data: spaceSettingsRow },
    { data: retreatProfileRow },
    { data: moduleIntrosRow },
    { data: guidelineRows },
    { data: inspirationRows },
    { data: readingRows },
    { data: audioRows },
  ] = await Promise.all([
    // PRE-MIGRATION WARNING: custom_surface (0032), custom_navigation/
    // custom_text (0015) and custom_secondary/hero_image_ref/
    // space_image_ref/logo_ref (0014) must all exist on the same database
    // this code runs against - this select will error for every tenant,
    // breaking this entire page, otherwise. Intentional coupling, not an
    // oversight - do not deploy this code ahead of whichever of those
    // migrations hasn't applied yet.
    supabase
      .from("brand_configs")
      .select(
        "palette, atmosphere, custom_primary, custom_secondary, custom_navigation, custom_text, custom_surface, hero_image_ref, space_image_ref, logo_ref"
      )
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    supabase
      .from("schedule_items")
      .select("id, date, start_time, end_time, title, facilitator, location, description, category, metadata")
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
      .select("id, title, subtitle, description, image_ref, metadata")
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
    supabase.from("module_configs").select("module_key, enabled, image_ref, image_position").eq("tenant_id", tenantId),
    supabase.from("published_spaces").select("published_at, modules").eq("tenant_id", tenantId).maybeSingle(),
    supabase
      .from("module_settings")
      .select("data")
      .eq("tenant_id", tenantId)
      .eq("module_key", SPACE_SETTINGS_KEY)
      .maybeSingle(),
    // TASK 029 - the five new content reads. Same shape as their
    // siblings above, added to the same single parallel phase rather
    // than a second serial one.
    supabase
      .from("module_settings")
      .select("data")
      .eq("tenant_id", tenantId)
      .eq("module_key", RETREAT_PROFILE_KEY)
      .maybeSingle(),
    supabase
      .from("module_settings")
      .select("data")
      .eq("tenant_id", tenantId)
      .eq("module_key", MODULE_INTROS_KEY)
      .maybeSingle(),
    supabase
      .from("module_items")
      .select("id, title, description")
      .eq("tenant_id", tenantId)
      .eq("module_key", GUIDELINES_KEY)
      .order("sort_order"),
    supabase
      .from("module_items")
      .select("id, title, description, metadata")
      .eq("tenant_id", tenantId)
      .eq("module_key", DAILY_INSPIRATION_KEY)
      .order("sort_order"),
    supabase
      .from("module_items")
      .select("id, title, subtitle, description, image_ref, external_link, metadata")
      .eq("tenant_id", tenantId)
      .eq("module_key", FLOW_READINGS_KEY)
      .order("sort_order"),
    supabase
      .from("module_items")
      .select("id, title, subtitle, description, image_ref, external_link, metadata")
      .eq("tenant_id", tenantId)
      .eq("module_key", FLOW_AUDIO_KEY)
      .order("sort_order"),
  ]);

  // Share Your Space's Share Card needs the PUBLISHED Hero image, not the
  // draft one - reused verbatim from how the Guest App itself resolves it
  // (brandMediaSchema + publicMediaUrl, same as published-space-screen.tsx)
  // so this is exactly what a guest already sees, never a new exposure or
  // a new Storage copy.
  const publishedBrandMediaParsed = brandMediaSchema.safeParse(published?.modules && (published.modules as { brand?: unknown }).brand);
  const publishedHeroImageRef = publishedBrandMediaParsed.success ? (publishedBrandMediaParsed.data.hero?.imageRef ?? null) : null;
  const publishedHeroImageUrl = publishedHeroImageRef ? publicMediaUrl(publishedHeroImageRef) : null;

  const initialSchedule: EditableScheduleItem[] = (scheduleRows ?? []).map((r) => {
    // TASK 029 (P5D): the per-activity extra details live in the one
    // column 0033 added. Parsed defensively through the same schema the
    // Guest App reads, so a hand-edited value degrades to [] rather than
    // breaking the whole Studio page.
    const extras = activityExtrasSchema.safeParse(r.metadata ?? {});
    return {
      id: r.id,
      date: r.date,
      startTime: (r.start_time ?? "").slice(0, 5),
      endTime: r.end_time ? r.end_time.slice(0, 5) : null,
      title: r.title,
      facilitator: r.facilitator,
      location: r.location,
      description: r.description,
      category: r.category,
      whatToBring: extras.success ? extras.data.whatToBring : [],
      whatToExpect: extras.success ? extras.data.whatToExpect : [],
    };
  });

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
        return {
          id: r.id,
          name: r.title,
          role: r.subtitle,
          bio: r.description,
          longBio: (meta.longBio as string | null) ?? null,
          imageRef: r.image_ref,
          imageUrl: await resolveImageUrl(supabase, r.image_ref),
          specialties: Array.isArray(meta.specialties) ? (meta.specialties as string[]) : [],
          socialLinks: socialLinksParsed.success ? socialLinksParsed.data : [],
          imagePosition: parseImagePosition(meta.imagePosition),
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
          imagePosition: parseImagePosition(meta.imagePosition),
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
          imagePosition: parseImagePosition(meta.imagePosition),
          // TASK 029 (D1) - Treatments & Extras.
          price: typeof meta.price === "number" ? meta.price : null,
          currency: (meta.currency as string | null) ?? null,
          chargeType: parseChargeType(meta.chargeType),
          availability: (meta.availability as string | null) ?? null,
        };
      })
    ),
    Promise.all(
      (facilityRows ?? []).map(async (r) => {
        const meta = (r.metadata ?? {}) as Record<string, unknown>;
        return {
          id: r.id,
          name: r.title,
          // TASK 029 (D4): the short line is the `subtitle` column, the
          // same place treatments keeps it. See lib/modules/facility.ts.
          shortDescription: r.subtitle,
          description: r.description,
          imageRef: r.image_ref,
          imageUrl: await resolveImageUrl(supabase, r.image_ref),
          openingHours: (meta.openingHours as string | null) ?? null,
          location: (meta.location as string | null) ?? null,
          importantInfo: (meta.importantInfo as string | null) ?? null,
          imagePosition: parseImagePosition(meta.imagePosition),
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
          imagePosition: parseImagePosition(meta.imagePosition),
        };
      })
    ),
  ]);

  const initialDailyInspirations: EditableInspirationItem[] = (inspirationRows ?? []).map((r) => {
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    return {
      id: r.id,
      label: r.title ?? "",
      text: r.description ?? "",
      enabled: typeof meta.enabled === "boolean" ? meta.enabled : true,
    };
  });

  const initialGuidelines: EditableGuideline[] = (guidelineRows ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
  }));

  // Readings and Audio keep the item envelope rather than being
  // flattened, so the Studio edits exactly the shape that publishes and
  // exactly the shape the shared schemas read.
  const [initialReadings, initialAudio]: [EditableFlowReading[], EditableFlowTrack[]] = await Promise.all([
    Promise.all(
      (readingRows ?? []).map(async (r) => {
        const parsed = readingMetadataSchema.safeParse(r.metadata ?? {});
        return {
          id: r.id,
          title: r.title,
          subtitle: r.subtitle,
          description: r.description,
          imageRef: r.image_ref,
          imageUrl: await resolveImageUrl(supabase, r.image_ref),
          externalLink: r.external_link,
          metadata: parsed.success ? parsed.data : { ...EMPTY_READING_METADATA },
        };
      })
    ),
    Promise.all(
      (audioRows ?? []).map(async (r) => {
        const parsed = flowAudioMetadataSchema.safeParse(r.metadata ?? {});
        const metadata = parsed.success ? parsed.data : { ...EMPTY_FLOW_AUDIO_METADATA };
        const [imageUrl, audioUrl] = await Promise.all([
          resolveImageUrl(supabase, r.image_ref),
          resolveImageUrl(supabase, metadata.audioRef),
        ]);
        return {
          id: r.id,
          title: r.title,
          subtitle: r.subtitle,
          description: r.description,
          imageRef: r.image_ref,
          imageUrl,
          audioUrl,
          externalLink: r.external_link,
          metadata,
        };
      })
    ),
  ]);

  const retreatProfileParsed = retreatProfileRow?.data
    ? retreatProfileSchema.safeParse(retreatProfileRow.data)
    : null;
  const initialRetreatProfile: RetreatProfile = retreatProfileParsed?.success
    ? retreatProfileParsed.data
    : EMPTY_RETREAT_PROFILE;

  const moduleIntrosParsed = moduleIntrosRow?.data ? moduleIntrosSchema.safeParse(moduleIntrosRow.data) : null;
  const initialModuleIntros: ModuleIntros = moduleIntrosParsed?.success
    ? moduleIntrosParsed.data
    : EMPTY_MODULE_INTROS;

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

  // Explore module hero/cover images (added alongside Task 015) - same
  // signed-URL-via-RLS-scoped-session resolution as every other draft
  // Storage preview on this page, keyed by module_key so the Modules
  // step can show each module's own cover next to its toggle.
  const initialModuleCovers: Record<
    string,
    { imageRef: string | null; imageUrl: string | null; imagePosition: ImagePosition }
  > = {};
  await Promise.all(
    (moduleConfigRows ?? []).map(async (r) => {
      const row = r as { image_ref: string | null; image_position: unknown };
      initialModuleCovers[r.module_key] = {
        imageRef: row.image_ref,
        imageUrl: await resolveImageUrl(supabase, row.image_ref),
        imagePosition: parseImagePosition(row.image_position),
      };
    })
  );

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
        initialLocale={parseSpaceSettings(spaceSettingsRow?.data).locale ?? DEFAULT_LOCALE}
        initialPalette={brandInitial.initialPalette as PaletteKey}
        initialAtmosphere={brandInitial.initialAtmosphere as AtmosphereKey}
        initialCustomPrimary={brandInitial.initialCustomPrimary}
        initialCustomSecondary={brandInitial.initialCustomSecondary}
        initialCustomNavigation={brandInitial.initialCustomNavigation}
        initialCustomSurface={brandInitial.initialCustomSurface}
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
        initialRetreatProfile={initialRetreatProfile}
        initialModuleIntros={initialModuleIntros}
        initialGuidelines={initialGuidelines}
        initialDailyInspirations={initialDailyInspirations}
        initialReadings={initialReadings}
        initialAudio={initialAudio}
        initialEnabledModules={initialEnabledModules}
        initialModuleCovers={initialModuleCovers}
        initialPublishedAt={published?.published_at ?? null}
        initialIsPubliclyAvailable={initialIsPubliclyAvailable}
        initialGuestAccessSettings={initialGuestAccessSettings}
        initialFeaturedSubmission={initialFeaturedSubmission}
        publishedHeroImageUrl={publishedHeroImageUrl}
      />
    </main>
  );
}
