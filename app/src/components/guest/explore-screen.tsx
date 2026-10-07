"use client";

import { useState, cloneElement } from "react";
import { deriveThemeVars } from "@/lib/theme/deriveTheme";
import type { BrandConfig } from "@/lib/theme/tokens";
import type { OptionalModuleKey } from "@/lib/modules/catalog";
import type { DisplayMeal } from "@/lib/modules/meal";
import type { DisplayTreatment } from "@/lib/modules/treatment";
import type { DisplayFacility } from "@/lib/modules/facility";
import type { ArrivalInfo } from "@/lib/modules/arrival";
import type { DisplayFaqItem } from "@/lib/modules/faq";
import type { DisplayCustomPage } from "@/lib/modules/customPage";
import type { StayConnected } from "@/lib/modules/stayConnected";
import type { DisplayGuideline } from "@/lib/modules/guideline";
import { playableTracks, type DisplayFlowReading, type DisplayFlowTrack } from "@/lib/modules/flowLibrary";
import { objectPositionStyle, type ImagePosition } from "@/lib/modules/imagePosition";
import { MealsScreen } from "../meals-screen";
import { TreatmentsScreen } from "../treatments-screen";
import { FacilitiesScreen } from "../facilities-screen";
import { ArrivalScreen } from "../arrival-screen";
import { FaqScreen } from "../faq-screen";
import { StayConnectedScreen } from "../stay-connected-screen";
import { CustomPageScreen } from "../custom-page-screen";
import { GuidelinesScreen } from "./guidelines-screen";
import { ReadingsScreen } from "./readings-screen";
import { AudioScreen } from "./audio-screen";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PinIcon,
  QuestionIcon,
  PagesIcon,
  WebsiteIcon,
  GuidelinesIcon,
  ReadingsIcon,
  AudioIcon,
} from "./icons";
import type { CSSProperties, ReactElement } from "react";

import { createTranslator, splitEmphasis, translate, DEFAULT_LOCALE, type Locale } from "@/lib/i18n";
import { BrandImage } from "@/components/shared/brand-image";
import { FLOW_SIZES } from "@/components/flow-media-sizes";
export type ExploreScreenProps = {
  brand: BrandConfig;
  enabledModules: OptionalModuleKey[];
  meals: DisplayMeal[];
  treatments: DisplayTreatment[];
  facilities: DisplayFacility[];
  arrivalInfo: ArrivalInfo;
  faq: DisplayFaqItem[];
  customPages: DisplayCustomPage[];
  stayConnected: StayConnected;
  /** TASK 029 - the three new Explore modules, plus Meals' own intro. */
  guidelines?: DisplayGuideline[];
  readings?: DisplayFlowReading[];
  audio?: DisplayFlowTrack[];
  mealsIntro?: string | null;
  /** Explore module hero/cover images (added alongside Task 015) -
   * moduleKey -> resolved image URL + its own focal point (TASK 020).
   * Takes precedence over the existing per-item-derived fallback below
   * when set for meals/treatments/facilities; the sole image source for
   * arrivalInfo/faq/stayConnected, which have no per-item concept. */
  moduleCoverImages?: Record<string, { imageUrl: string | null; imagePosition: ImagePosition }>;
  /** The Space's system language. */
  locale?: Locale;
};

type FixedExplorePage =
  | "meals"
  | "treatments"
  | "facilities"
  | "arrivalInfo"
  | "guidelines"
  | "faq"
  | "readings"
  | "audio"
  | "stayConnected";
type ExplorePage = FixedExplorePage | `customPage:${number}`;

/** Which brand color a given Explore entry card/tile draws from - see
 * `nextTone()` below for how each visible entry gets assigned one. */
type Tone = "primary" | "accent";

/**
 * Visual Fidelity Phase 1 - ported from the approved Figma source's
 * ExploreScreen: varied-rhythm entry cards (Meals wide photo, Treatments
 * taller photo, Facilities+Arrival as a 2-col grid with Arrival as a
 * solid-primary block instead of a photo), not a uniform grid. Each
 * module's teaser photo is the tenant's own first uploaded item image for
 * that module when one exists (real tenant data), never a stock/demo
 * photo - modules with no photographed items yet fall back to a plain
 * gradient tile rather than fabricating imagery.
 */

/**
 * Which `sizes` each module's cover is requested at, by card shape:
 * full-width EntryCards for the three catalogue modules, half-width
 * SolidTiles for the rest.
 *
 * Exported so the background prefetcher (lib/media/prefetch.ts) warms
 * the same candidate this screen will ask for. If the two disagreed the
 * visitor would download two renders of one cover, which is the exact
 * waste CP4 is removing - hence one table, read by both.
 */
export const EXPLORE_COVER_SIZES: Record<string, string> = {
  meals: FLOW_SIZES.frame,
  treatments: FLOW_SIZES.frame,
  // Facilities is an EntryCard like the two above it, but a `compact`
  // one - it shares a row with the tiles, so it has a tile's box.
  facilities: FLOW_SIZES.tile,
  arrivalInfo: FLOW_SIZES.tile,
  faq: FLOW_SIZES.tile,
  stayConnected: FLOW_SIZES.tile,
  // TASK 029 - all three render as SolidTiles, so all three get a
  // tile's box. Listed here, not guessed by the prefetcher: the
  // prefetcher and the <img> must agree on the candidate or the visitor
  // downloads two renders of one cover.
  guidelines: FLOW_SIZES.tile,
  readings: FLOW_SIZES.tile,
  audio: FLOW_SIZES.tile,
};

/** Custom pages render as SolidTiles alongside the fixed modules. */
export const EXPLORE_CUSTOM_PAGE_SIZES = FLOW_SIZES.tile;

export function ExploreScreen({
  brand,
  enabledModules,
  meals,
  treatments,
  facilities,
  arrivalInfo,
  faq,
  customPages,
  stayConnected,
  guidelines = [],
  readings = [],
  audio = [],
  mealsIntro = null,
  moduleCoverImages = {},
  locale = DEFAULT_LOCALE,
}: ExploreScreenProps) {
  const vars = deriveThemeVars(brand) as CSSProperties;
  const { t } = createTranslator(locale);
  const [page, setPage] = useState<ExplorePage | null>(null);

  const hasMeals = enabledModules.includes("meals");
  const hasTreatments = enabledModules.includes("treatments");
  const hasFacilities = enabledModules.includes("facilities");
  const hasArrival = enabledModules.includes("arrivalInfo");
  const hasFaq = enabledModules.includes("faq") && faq.length > 0;
  const hasStayConnected = enabledModules.includes("stayConnected") && stayConnected.links.length > 0;
  const hasCustomPages = enabledModules.includes("customPages") && customPages.length > 0;
  // TASK 029: enabled AND non-empty, like FAQ above - an organizer who
  // switched a module on but has not written anything yet gets no card,
  // rather than a card that leads to an empty screen.
  const hasGuidelines = enabledModules.includes("guidelines") && guidelines.length > 0;
  const hasReadings = enabledModules.includes("readings") && readings.length > 0;
  const playable = playableTracks(audio) as DisplayFlowTrack[];
  const hasAudio = enabledModules.includes("audio") && playable.length > 0;

  if (page === "meals") return <ExploreSubPage vars={vars} onBack={() => setPage(null)} locale={locale}><MealsScreen brand={brand} meals={meals} intro={mealsIntro} locale={locale} /></ExploreSubPage>;
  if (page === "treatments") return <ExploreSubPage vars={vars} onBack={() => setPage(null)} locale={locale}><TreatmentsScreen brand={brand} treatments={treatments} locale={locale} /></ExploreSubPage>;
  if (page === "facilities") return <ExploreSubPage vars={vars} onBack={() => setPage(null)} locale={locale}><FacilitiesScreen brand={brand} facilities={facilities} locale={locale} /></ExploreSubPage>;
  if (page === "arrivalInfo") return <ExploreSubPage vars={vars} onBack={() => setPage(null)} locale={locale}><ArrivalScreen brand={brand} info={arrivalInfo} locale={locale} /></ExploreSubPage>;
  if (page === "faq") return <ExploreSubPage vars={vars} onBack={() => setPage(null)} locale={locale}><FaqScreen brand={brand} faq={faq} locale={locale} /></ExploreSubPage>;
  if (page === "guidelines") return <ExploreSubPage vars={vars} onBack={() => setPage(null)} locale={locale}><GuidelinesScreen brand={brand} guidelines={guidelines} locale={locale} /></ExploreSubPage>;
  if (page === "readings") return <ExploreSubPage vars={vars} onBack={() => setPage(null)} locale={locale}><ReadingsScreen brand={brand} readings={readings} locale={locale} /></ExploreSubPage>;
  if (page === "audio") return <ExploreSubPage vars={vars} onBack={() => setPage(null)} locale={locale}><AudioScreen brand={brand} tracks={playable} locale={locale} /></ExploreSubPage>;
  if (page === "stayConnected") return <ExploreSubPage vars={vars} onBack={() => setPage(null)} locale={locale}><StayConnectedScreen brand={brand} stayConnected={stayConnected} locale={locale} /></ExploreSubPage>;
  if (page?.startsWith("customPage:")) {
    const idx = Number(page.slice("customPage:".length));
    const customPage = customPages[idx];
    if (customPage) {
      return (
        <ExploreSubPage vars={vars} onBack={() => setPage(null)} locale={locale}>
          <CustomPageScreen brand={brand} page={customPage} />
        </ExploreSubPage>
      );
    }
  }

  // Task 015: an organizer-chosen module cover takes precedence over the
  // pre-existing "borrow the first item's own photo" fallback - both are
  // real tenant images, never a stock/demo photo, so falling back is
  // still exactly as honest as before this feature existed.
  //
  // TASK 020: the focal point travels WITH whichever image actually ends
  // up shown - the module cover's own independent focus point when a
  // cover is set, or that same fallback item's own focus point when
  // borrowing its photo (the same asset, the same framing, wherever it
  // appears - see TASK-020 report, Section 5's "usage vs. shared asset"
  // discussion).
  const mealsFallback = meals.find((m) => m.imageUrl);
  const mealsCover = moduleCoverImages.meals;
  const mealsImage = mealsCover?.imageUrl ?? mealsFallback?.imageUrl ?? null;
  const mealsImagePosition = mealsCover?.imageUrl ? mealsCover.imagePosition : (mealsFallback?.imagePosition ?? null);

  const treatmentsFallback = treatments.find((t) => t.imageUrl);
  const treatmentsCover = moduleCoverImages.treatments;
  const treatmentsImage = treatmentsCover?.imageUrl ?? treatmentsFallback?.imageUrl ?? null;
  const treatmentsImagePosition = treatmentsCover?.imageUrl
    ? treatmentsCover.imagePosition
    : (treatmentsFallback?.imagePosition ?? null);

  const facilitiesFallback = facilities.find((f) => f.imageUrl);
  const facilitiesCover = moduleCoverImages.facilities;
  const facilitiesImage = facilitiesCover?.imageUrl ?? facilitiesFallback?.imageUrl ?? null;
  const facilitiesImagePosition = facilitiesCover?.imageUrl
    ? facilitiesCover.imagePosition
    : (facilitiesFallback?.imagePosition ?? null);

  const arrivalImage = moduleCoverImages.arrivalInfo?.imageUrl ?? null;
  const arrivalImagePosition = moduleCoverImages.arrivalInfo?.imagePosition ?? null;
  const faqImage = moduleCoverImages.faq?.imageUrl ?? null;
  const faqImagePosition = moduleCoverImages.faq?.imagePosition ?? null;
  const stayConnectedImage = moduleCoverImages.stayConnected?.imageUrl ?? null;
  const stayConnectedImagePosition = moduleCoverImages.stayConnected?.imagePosition ?? null;
  // TASK 029: the three new modules borrow a first item's own photo the
  // same way meals/treatments/facilities always have - a reading's cover
  // or a track's artwork is a real tenant image, so falling back to one
  // is exactly as honest here as it is there. Guidelines have no items
  // with photos, so a cover is their only image source.
  const guidelinesImage = moduleCoverImages.guidelines?.imageUrl ?? null;
  const guidelinesImagePosition = moduleCoverImages.guidelines?.imagePosition ?? null;
  const readingsFallback = readings.find((r) => r.imageUrl);
  const readingsCover = moduleCoverImages.readings;
  const readingsImage = readingsCover?.imageUrl ?? readingsFallback?.imageUrl ?? null;
  const readingsImagePosition = readingsCover?.imageUrl
    ? readingsCover.imagePosition
    : (readingsFallback?.metadata.imagePosition ?? null);
  const audioFallback = playable.find((a) => a.imageUrl);
  const audioCover = moduleCoverImages.audio;
  const audioImage = audioCover?.imageUrl ?? audioFallback?.imageUrl ?? null;
  const audioImagePosition = audioCover?.imageUrl
    ? audioCover.imagePosition
    : (audioFallback?.metadata.imagePosition ?? null);

  // Alternating Primary/Accent rhythm across every visible entry, in
  // render order, regardless of which modules are enabled - a tenant
  // with only two modules on still gets Primary then Accent, not two
  // Primary cards in a row. One running counter shared by every
  // EntryCard/SolidTile below, not a per-list-position calculation, so
  // the sequence stays correct no matter which combination of modules is
  // enabled/disabled or reordered.
  let toneIndex = 0;
  const nextTone = (): Tone => (toneIndex++ % 2 === 0 ? "primary" : "accent");

  return (
    <div style={{ ...vars, background: "var(--rbr-background)" }} className="flex-1 overflow-y-auto no-scrollbar">
      <div className="px-6 pt-8 pb-4">
        <p className="text-[10px] tracking-[0.22em] uppercase font-medium mb-1" style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-mist)" }}>
          {t("flow", "navExplore")}
        </p>
        <h1 className="text-[28px] font-normal leading-tight" style={{ fontFamily: "var(--rbr-font-display)", color: "var(--rbr-text)" }}>
          {splitEmphasis(t("flow", "exploreHeading"), t("flow", "exploreHeadingEm")).map((part, i) =>
            i === 1 ? <em key={i}>{part}</em> : part
          )}
        </h1>
      </div>

      <div className="px-4 pb-10 space-y-3">
        {hasMeals && (
          <EntryCard
            tone={nextTone()}
            onClick={() => setPage("meals")}
            imageUrl={mealsImage}
            imagePosition={mealsImagePosition}
            eyebrow={t("flow", "eyebrowMeals")}
            title={t("flow", "meals")}
            heightClass="h-[180px]"
            showChevron
          />
        )}
        {hasTreatments && (
          <EntryCard
            tone={nextTone()}
            onClick={() => setPage("treatments")}
            imageUrl={treatmentsImage}
            imagePosition={treatmentsImagePosition}
            eyebrow={t("flow", "eyebrowTreatments")}
            title={t("flow", "treatments")}
            heightClass="h-[200px]"
          />
        )}
        {(hasFacilities || hasArrival || hasGuidelines || hasFaq || hasReadings || hasAudio || hasStayConnected || hasCustomPages) && (
          <div className="grid grid-cols-2 gap-3">
            {hasFacilities && (
              <EntryCard
                tone={nextTone()}
                onClick={() => setPage("facilities")}
                imageUrl={facilitiesImage}
                imagePosition={facilitiesImagePosition}
                eyebrow={t("flow", "eyebrowFacilities")}
                title={t("flow", "facilities")}
                heightClass="h-[140px]"
                compact
              />
            )}
            {hasArrival && (
              <SolidTile
                tone={nextTone()}
                onClick={() => setPage("arrivalInfo")}
                icon={<PinIcon className="w-4 h-4" />}
                eyebrow={t("flow", "eyebrowArrival")}
                title={t("flow", "arrivalInfo")}
                imageUrl={arrivalImage}
                imagePosition={arrivalImagePosition}
              />
            )}
            {hasGuidelines && (
              <SolidTile
                tone={nextTone()}
                onClick={() => setPage("guidelines")}
                icon={<GuidelinesIcon className="w-4 h-4" />}
                eyebrow={t("flow", "eyebrowGuidelines")}
                /* The short form, only here: this tile truncates at 18px
                   and Spanish's full name does not fit on a phone. The
                   detail screen it opens keeps the full name. */
                title={t("flow", "guidelinesShort")}
                imageUrl={guidelinesImage}
                imagePosition={guidelinesImagePosition}
              />
            )}
            {hasFaq && (
              <SolidTile
                tone={nextTone()}
                onClick={() => setPage("faq")}
                icon={<QuestionIcon className="w-4 h-4" />}
                eyebrow={t("flow", "eyebrowFaq")}
                title={t("flow", "faq")}
                imageUrl={faqImage}
                imagePosition={faqImagePosition}
              />
            )}
            {hasReadings && (
              <SolidTile
                tone={nextTone()}
                onClick={() => setPage("readings")}
                icon={<ReadingsIcon className="w-4 h-4" />}
                eyebrow={t("flow", "eyebrowReadings")}
                title={t("flow", "readings")}
                imageUrl={readingsImage}
                imagePosition={readingsImagePosition}
              />
            )}
            {hasAudio && (
              <SolidTile
                tone={nextTone()}
                onClick={() => setPage("audio")}
                icon={<AudioIcon className="w-4 h-4" />}
                eyebrow={t("flow", "eyebrowAudio")}
                title={t("flow", "moduleAudio")}
                imageUrl={audioImage}
                imagePosition={audioImagePosition}
              />
            )}
            {hasStayConnected && (
              <SolidTile
                tone={nextTone()}
                onClick={() => setPage("stayConnected")}
                icon={<WebsiteIcon className="w-4 h-4" />}
                eyebrow={t("flow", "eyebrowStayConnected")}
                title={t("flow", "stayConnected")}
                imageUrl={stayConnectedImage}
                imagePosition={stayConnectedImagePosition}
              />
            )}
            {hasCustomPages &&
              customPages.map((p, i) => (
                <SolidTile
                  key={i}
                  tone={nextTone()}
                  onClick={() => setPage(`customPage:${i}`)}
                  icon={<PagesIcon className="w-4 h-4" />}
                  eyebrow={t("flow", "eyebrowMore")}
                  title={p.title}
                  imageUrl={p.imageUrl}
                  imagePosition={p.imagePosition}
                />
              ))}
          </div>
        )}
        {!hasMeals &&
          !hasTreatments &&
          !hasFacilities &&
          !hasArrival &&
          !hasGuidelines &&
          !hasFaq &&
          !hasReadings &&
          !hasAudio &&
          !hasStayConnected &&
          !hasCustomPages && (
            <div className="text-xs px-1" style={{ fontFamily: "var(--rbr-font-ui)", color: "var(--rbr-mist)" }}>
              {t("flow", "exploreEmpty")}
            </div>
          )}
      </div>
    </div>
  );
}

/** CSS var names for a given tone - the only place Primary vs. Accent is
 * chosen; every consumer below reads through this, never a literal
 * `--rbr-primary`/`--rbr-secondary` reference of its own. */
const TONE_VARS: Record<Tone, { color: string; onColor: string; dark: string }> = {
  primary: { color: "var(--rbr-primary)", onColor: "var(--rbr-on-primary)", dark: "var(--rbr-primary-dark)" },
  accent: { color: "var(--rbr-secondary)", onColor: "var(--rbr-on-secondary)", dark: "var(--rbr-secondary-dark)" },
};

function EntryCard({
  tone,
  onClick,
  imageUrl,
  imagePosition,
  eyebrow,
  title,
  heightClass,
  compact,
  showChevron,
}: {
  tone: Tone;
  onClick: () => void;
  imageUrl: string | null;
  imagePosition?: ImagePosition;
  eyebrow: string;
  title: string;
  heightClass: string;
  compact?: boolean;
  showChevron?: boolean;
}) {
  const v = TONE_VARS[tone];
  return (
    <button type="button" onClick={onClick} className={`w-full rounded-3xl overflow-hidden relative ${heightClass}`}>
      {/* Brand-tinted fallback (Primary or Accent, alternating - see
          `tone`), always blended toward the fixed near-black forest
          neutral (--rbr-{primary|secondary}-dark) so this card's
          fixed-white title/eyebrow text stays legible even when the
          organizer's raw colour is very light - not reliant on the
          gradient overlay alone the way a real photo's overlay is. */}
      <BrandImage
        src={imageUrl}
        alt=""
        className="w-full h-full"
        /* `compact` is not only padding: it is what puts this card two to
           a row in the grid below, so its box is a tile's, not a
           full-width card's. CP4's browser matrix caught this declaring
           the full width regardless - a 138px tile on a 320px phone was
           fetching a 960px render where 480 covers it. */
        sizes={compact ? FLOW_SIZES.tile : FLOW_SIZES.frame}
        style={{ objectPosition: objectPositionStyle(imagePosition ?? null) }}
        fallback={`linear-gradient(160deg, ${v.color}, ${v.dark})`}
      />
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(to top, color-mix(in srgb, ${v.dark} 85%, transparent), color-mix(in srgb, ${v.dark} 15%, transparent) 60%, transparent)` }}
      />
      <div className={`absolute inset-0 flex flex-col justify-end ${compact ? "p-3.5" : "p-5"}`}>
        <p
          className={`${compact ? "text-[9px]" : "text-[10px]"} tracking-[0.2em] uppercase font-medium`}
          style={{ fontFamily: "var(--rbr-font-ui)", color: `color-mix(in srgb, white 65%, ${v.color})` }}
        >
          {eyebrow}
        </p>
        <h2 className={`${compact ? "text-[18px]" : "text-[24px]"} leading-tight mt-0.5 text-white`} style={{ fontFamily: "var(--rbr-font-display)" }}>
          {title}
        </h2>
      </div>
      {showChevron && (
        <div className="absolute end-5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center bg-white/15">
          <ChevronRightIcon className="text-white" />
        </div>
      )}
    </button>
  );
}

/** The compact solid-brand tile (originally Arrival's own inline markup)
 * - now shared by every non-photographed Explore entry (Arrival, FAQ,
 * Stay Connected, each Custom Page), matching Figma's varied-rhythm
 * approach: photographed modules get a photo card, everything else gets
 * this same solid treatment - alternating Primary/Accent (see `tone`)
 * rather than every tile being identical. */
/**
 * Task 015 addition: SolidTile now accepts an optional `imageUrl` - the
 * same image-or-gradient-fallback treatment EntryCard already uses
 * (unifying both into one visual language, per the shared-card-system
 * requirement) rather than a second, divergent image implementation.
 * With no image (the default, and every pre-existing caller's exact
 * prior behavior), this renders byte-for-byte what it always has: the
 * solid tone color, icon and text - no regression for Arrival/FAQ/Stay
 * Connected/Custom Pages until an organizer actually sets a cover.
 */
function SolidTile({
  tone,
  onClick,
  icon,
  eyebrow,
  title,
  imageUrl,
  imagePosition,
}: {
  tone: Tone;
  onClick: () => void;
  icon: ReactElement<{ style?: CSSProperties }>;
  eyebrow: string;
  title: string;
  imageUrl?: string | null;
  imagePosition?: ImagePosition;
}) {
  const v = TONE_VARS[tone];
  return (
    <button type="button" onClick={onClick} className="rounded-3xl h-[140px] relative overflow-hidden text-start">
      <BrandImage
        src={imageUrl}
        alt=""
        className="w-full h-full"
        sizes={FLOW_SIZES.tile}
        style={{ objectPosition: objectPositionStyle(imagePosition ?? null) }}
        fallback={v.color}
      />
      {imageUrl && (
        <div
          className="absolute inset-0"
          style={{ background: `linear-gradient(to top, color-mix(in srgb, ${v.dark} 80%, transparent), color-mix(in srgb, ${v.dark} 10%, transparent) 60%, transparent)` }}
        />
      )}
      <div className="absolute inset-0 p-4 flex flex-col justify-between">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center"
          style={{ background: `color-mix(in srgb, ${v.onColor} 10%, transparent)` }}
        >
          {cloneElement(icon, { style: { color: v.onColor, ...icon.props.style } })}
        </div>
        <div>
          <p
            className="text-[9px] tracking-widest uppercase font-medium"
            style={{ fontFamily: "var(--rbr-font-ui)", color: v.onColor, opacity: 0.75 }}
          >
            {eyebrow}
          </p>
          {/* Mixed content: a fixed module's title is a system string in
              the Space's language, but a custom page's is whatever the
              organizer typed - so this one tile has to read its own
              direction rather than inherit the Space's. EntryCard above
              needs no equivalent: meals, treatments and facilities are
              the only callers and all three titles are system strings. */}
          {/* Two lines, not one.
              `truncate` cut every module name that did not fit a half-width
              tile, and at 320px that was most of them in every language -
              English included ("Stay connected", "Custom Pages"). German
              "Meine Aufnahmen" and Spanish "Sigue en contacto" still lost
              their ends at 390. The tile has the room: 140px, with a 32px
              icon and 16px padding, leaves ~76px for an 11px eyebrow and
              the title, and two lines of 18px at leading-tight come to 45.
              So the fix is layout, not shorter words - the approved
              translations stay exactly as the owner wrote them.
              `break-words` catches the one case wrapping cannot help, a
              single word wider than the tile. */}
          <h3 dir="auto" className="text-[18px] leading-tight mt-0.5 line-clamp-2 break-words" style={{ fontFamily: "var(--rbr-font-display)", color: v.onColor }}>
            {title}
          </h3>
        </div>
      </div>
    </button>
  );
}

function ExploreSubPage({ vars, onBack, children, locale }: { vars: CSSProperties; onBack: () => void; children: React.ReactNode; locale: Locale }) {
  return (
    <div style={{ ...vars, background: "var(--rbr-background)" }} className="w-full h-full flex flex-col overflow-hidden">
      <button
        type="button"
        onClick={onBack}
        style={{ color: "var(--rbr-mist)", fontFamily: "var(--rbr-font-ui)" }}
        className="flex items-center gap-1.5 px-5 pt-5 pb-1 text-[11px] font-medium tracking-[0.08em] uppercase shrink-0"
      >
        <ChevronLeftIcon />
        {translate(locale, "flow", "navExplore")}
      </button>
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">{children}</div>
    </div>
  );
}
