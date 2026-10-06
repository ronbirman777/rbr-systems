"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { TodayScreen } from "./today-screen";
import { ScheduleScreen } from "./schedule-screen";
import { FacilitatorsScreen } from "./facilitators-screen";
import { ExploreScreen, EXPLORE_COVER_SIZES, EXPLORE_CUSTOM_PAGE_SIZES } from "./guest/explore-screen";
import { FLOW_SIZES } from "./flow-media-sizes";
import { MediaPrefetch } from "./shared/media-prefetch";
import type { MediaPrefetchItem } from "@/lib/media/prefetch";
import { TodayIcon, ScheduleIcon, TeamIcon, ExploreIcon } from "./guest/icons";
import { deriveThemeVars } from "@/lib/theme/deriveTheme";
import type { BrandConfig } from "@/lib/theme/tokens";
import type { PublicScheduleItem } from "@/lib/schedule/types";
import type { DisplayFacilitator } from "@/lib/modules/facilitator";
import type { DisplayMeal } from "@/lib/modules/meal";
import type { DisplayTreatment } from "@/lib/modules/treatment";
import type { DisplayFacility } from "@/lib/modules/facility";
import type { ArrivalInfo } from "@/lib/modules/arrival";
import { EMPTY_ARRIVAL_INFO } from "@/lib/modules/arrival";
import type { DisplayFaqItem } from "@/lib/modules/faq";
import type { DisplayCustomPage } from "@/lib/modules/customPage";
import { EMPTY_STAY_CONNECTED, type StayConnected } from "@/lib/modules/stayConnected";
import type { DisplayGuideline } from "@/lib/modules/guideline";
import { playableTracks, type DisplayFlowReading, type DisplayFlowTrack } from "@/lib/modules/flowLibrary";
import { EMPTY_RETREAT_PROFILE, retreatWelcome, retreatWhatToBring, type RetreatProfile } from "@/lib/modules/retreatProfile";
import { moduleIntro, type ModuleIntros } from "@/lib/modules/moduleIntro";
import type { OptionalModuleKey } from "@/lib/modules/catalog";
import { getDailyQuote } from "@/lib/content/dailyQuotes";
import { createTranslator, DEFAULT_LOCALE, type Locale } from "@/lib/i18n";
import type { ImagePosition } from "@/lib/modules/imagePosition";

export type GuestAppProps = {
  tenantName: string;
  brand: BrandConfig;
  /** Not yet reaching Production - requires migration 0014
   * (brand_configs.hero_image_ref) to persist and publish_space() to
   * forward it. Draft callers can already pass a real signed URL; every
   * published-route caller passes null until that migration lands. */
  heroImageUrl?: string | null;
  /** Manual QA Fixes phase - resolved Retreat Logo URL, draft or
   * published depending on the caller (see today-screen.tsx's own note -
   * this component has no opinion on which, it only forwards it). */
  logoUrl?: string | null;
  todayIso: string;
  /** "HH:MM" in the Space timezone - drives "now" / "up next" context in Schedule. */
  nowTime: string;
  enabledModules: OptionalModuleKey[];
  schedule: PublicScheduleItem[];
  facilitators: DisplayFacilitator[];
  meals: DisplayMeal[];
  treatments: DisplayTreatment[];
  facilities: DisplayFacility[];
  arrivalInfo: ArrivalInfo;
  faq?: DisplayFaqItem[];
  customPages?: DisplayCustomPage[];
  stayConnected?: StayConnected;
  /**
   * TASK 029 - the retreat's own description and the three new modules.
   *
   * Optional, with the same reasoning as every other prop added since
   * this component was written: the Studio preview and the published
   * route both pass them, and any caller that predates them keeps
   * working and renders nothing new.
   */
  retreatProfile?: RetreatProfile;
  moduleIntros?: ModuleIntros;
  guidelines?: DisplayGuideline[];
  readings?: DisplayFlowReading[];
  audio?: DisplayFlowTrack[];
  /** Explore module hero/cover images (added alongside Task 015) -
   * moduleKey -> resolved image URL + focal point (TASK 020),
   * absent/null meaning "no cover set, use the existing fallback" (see
   * ExploreScreen). */
  moduleCoverImages?: Record<string, { imageUrl: string | null; imagePosition: ImagePosition }>;
  /** The Space's system language. Defaults to English so the Studio
   * preview and every caller written before CP3 keep working. */
  locale?: Locale;
};

/**
 * Time to Flow Visual Fidelity Phase 1 - the approved navigation model
 * (Figma source: exactly Today/Schedule/Team/Explore, always, never more).
 * Meals/Treatments/Facilities/Arrival are no longer top-level tabs - they
 * live inside Explore (see guest/explore-screen.tsx), matching the
 * approved design's own architecture exactly. This replaces the previous
 * "up to 7 flat tabs collapsing into a generic More sheet" model.
 */
type TabKey = "today" | "schedule" | "facilitators" | "explore";

const EXPLORE_MODULE_KEYS: OptionalModuleKey[] = [
  "meals",
  "treatments",
  "facilities",
  "arrivalInfo",
  "guidelines",
  "faq",
  "readings",
  "audio",
  "customPages",
  "stayConnected",
];

type TabDef = {
  key: TabKey;
  labelKey: "navToday" | "navSchedule" | "navTeam" | "navExplore";
  Icon: (props: { active?: boolean }) => ReactNode;
  render: (props: GuestAppProps, goTo: (key: TabKey) => void) => ReactNode;
};

const GUEST_TABS: TabDef[] = [
  {
    key: "today",
    labelKey: "navToday",
    Icon: TodayIcon,
    render: (props, goTo) => (
      <TodayScreen
        tenantName={props.tenantName}
        brand={props.brand}
        heroImageUrl={props.heroImageUrl}
        logoUrl={props.logoUrl}
        schedule={props.schedule}
        todayIso={props.todayIso}
        nowTime={props.nowTime}
        tagline={props.retreatProfile?.tagline ?? null}
        shortDescription={props.retreatProfile?.shortDescription ?? null}
        longDescription={props.retreatProfile?.longDescription ?? null}
        /* D3's precedence is resolved HERE, once, so neither screen nor
           any future caller has to re-decide it: the canonical value,
           then the legacy Arrival one, then nothing. */
        welcome={retreatWelcome(props.retreatProfile ?? EMPTY_RETREAT_PROFILE, props.arrivalInfo ?? EMPTY_ARRIVAL_INFO)}
        whatToBring={retreatWhatToBring(
          props.retreatProfile ?? EMPTY_RETREAT_PROFILE,
          props.arrivalInfo ?? EMPTY_ARRIVAL_INFO
        )}
        whatToExpect={props.retreatProfile?.whatToExpect ?? []}
        onViewSchedule={props.enabledModules.includes("schedule") ? () => goTo("schedule") : undefined}
        dailyQuote={props.enabledModules.includes("dailyInspiration") ? getDailyQuote(props.todayIso) : null}
        locale={props.locale ?? DEFAULT_LOCALE}
      />
    ),
  },
  {
    key: "schedule",
    labelKey: "navSchedule",
    Icon: ScheduleIcon,
    render: (props) => (
      <ScheduleScreen
        brand={props.brand}
        schedule={props.schedule}
        todayIso={props.todayIso}
        nowTime={props.nowTime}
        locale={props.locale ?? DEFAULT_LOCALE}
      />
    ),
  },
  {
    key: "facilitators",
    labelKey: "navTeam",
    Icon: TeamIcon,
    render: (props) => (
      <FacilitatorsScreen brand={props.brand} facilitators={props.facilitators} locale={props.locale ?? DEFAULT_LOCALE} />
    ),
  },
  {
    key: "explore",
    labelKey: "navExplore",
    Icon: ExploreIcon,
    render: (props) => (
      <ExploreScreen
        brand={props.brand}
        enabledModules={props.enabledModules}
        meals={props.meals}
        treatments={props.treatments}
        facilities={props.facilities}
        arrivalInfo={props.arrivalInfo ?? EMPTY_ARRIVAL_INFO}
        faq={props.faq ?? []}
        customPages={props.customPages ?? []}
        stayConnected={props.stayConnected ?? EMPTY_STAY_CONNECTED}
        guidelines={props.guidelines ?? []}
        readings={props.readings ?? []}
        audio={props.audio ?? []}
        mealsIntro={moduleIntro(props.moduleIntros, "meals")}
        moduleCoverImages={props.moduleCoverImages ?? {}}
        locale={props.locale ?? DEFAULT_LOCALE}
      />
    ),
  },
];


/**
 * The media on the tabs the visitor is NOT looking at, in the order the
 * bottom nav offers them - so the tab they are most likely to press next
 * is warmed first, and the prefetcher's cap falls on the least likely.
 *
 * Only images that will actually be rendered are listed: a module the
 * organizer has not enabled contributes nothing even if a stale cover
 * survives in the snapshot. Each entry carries the SAME `sizes` its
 * screen will use, imported from that screen rather than retyped here,
 * because a mismatch would warm the wrong render and cost two
 * downloads instead of one.
 *
 * Deliberately omitted: Schedule, which has no images, and the Explore
 * SUB-screens (Meals, Treatments, Facilities, each item's own photo).
 * Those are two presses deep, so warming them would be speculation on
 * speculation - the kind of "preload the whole media library" the brief
 * rules out.
 */
export function guestPrefetchItems(props: GuestAppProps, activeTab: TabKey): MediaPrefetchItem[] {
  const { enabledModules } = props;
  const items: MediaPrefetchItem[] = [];

  if (activeTab !== "facilitators" && enabledModules.includes("facilitators")) {
    for (const f of props.facilitators) items.push({ src: f.imageUrl, sizes: FLOW_SIZES.frame });
  }

  if (activeTab !== "explore") {
    for (const [moduleKey, sizes] of Object.entries(EXPLORE_COVER_SIZES)) {
      if (!enabledModules.includes(moduleKey as OptionalModuleKey)) continue;
      const cover = props.moduleCoverImages?.[moduleKey];
      if (cover?.imageUrl) items.push({ src: cover.imageUrl, sizes });
    }
    if (enabledModules.includes("customPages")) {
      for (const page of props.customPages ?? []) {
        items.push({ src: page.imageUrl, sizes: EXPLORE_CUSTOM_PAGE_SIZES });
      }
    }
    // TASK 029: Readings and Audio borrow a first item's own photo when
    // no cover is set (see ExploreScreen), so the fallback is what will
    // actually render - warm THAT, not a cover that does not exist.
    if (enabledModules.includes("readings") && !props.moduleCoverImages?.readings?.imageUrl) {
      const fallback = (props.readings ?? []).find((r) => r.imageUrl);
      if (fallback) items.push({ src: fallback.imageUrl, sizes: EXPLORE_COVER_SIZES.readings });
    }
    if (enabledModules.includes("audio") && !props.moduleCoverImages?.audio?.imageUrl) {
      const fallback = playableTracks(props.audio ?? []).find((a) => (a as DisplayFlowTrack).imageUrl) as
        | DisplayFlowTrack
        | undefined;
      if (fallback) items.push({ src: fallback.imageUrl, sizes: EXPLORE_COVER_SIZES.audio });
    }
  }

  return items;
}

/**
 * One fixed InnerDweS-controlled shell. The organizer's enabled_modules
 * decides which of the 4 tabs exist (Today is mandatory); everything
 * about how each tab looks, and how navigation itself behaves, is ours.
 * Used identically by the configurator's live preview (fed by
 * draft/local state) and the published guest route (fed by the
 * published_spaces snapshot) - this file owns the status bar, screen
 * router and bottom nav (the "inside the device" content); each caller
 * owns its own outer frame/centering, matching how the approved Figma
 * source itself keeps GuestApp's frame and GuestPreviewPane's frame as
 * two separate implementations around the same shared screens.
 */
export function GuestApp(props: GuestAppProps) {
  const { enabledModules, brand } = props;
  const vars = deriveThemeVars(brand) as CSSProperties;
  const { t } = createTranslator(props.locale ?? DEFAULT_LOCALE);

  const hasExplore = EXPLORE_MODULE_KEYS.some((k) => enabledModules.includes(k));
  const visibleTabs = GUEST_TABS.filter((tab) => {
    if (tab.key === "today") return true;
    if (tab.key === "explore") return hasExplore;
    return enabledModules.includes(tab.key as OptionalModuleKey);
  });

  const [active, setActive] = useState<TabKey>("today");
  const current = visibleTabs.find((tab) => tab.key === active) ?? visibleTabs[0];

  return (
    <div
      style={{
        ...vars,
        background: "var(--rbr-background)",
        // The real inset, not a drawn status bar. On a device with a
        // notch this keeps content clear of it; inside the Studio's
        // preview frame, and on any screen without one, it is 0 and the
        // layout is unchanged.
        paddingTop: "env(safe-area-inset-top)",
      }}
      className="relative w-full h-full flex flex-col overflow-hidden"
    >
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">{current.render(props, setActive)}</div>

      {/* Step 4 of the loading ladder - renders nothing, and starts only
          once this screen has finished loading and the main thread is
          idle, so it can never delay the hero above. */}
      <MediaPrefetch items={guestPrefetchItems(props, active)} />

      {visibleTabs.length > 1 && (
        <div
          className="flex-shrink-0"
          style={{
            borderTop: "1px solid color-mix(in srgb, var(--rbr-sand) 60%, transparent)",
            background: "color-mix(in srgb, var(--rbr-cream) 96%, transparent)",
            backdropFilter: "blur(20px)",
          }}
        >
          <div className="flex items-stretch">
            {visibleTabs.map((tab) => {
              const isActive = current.key === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActive(tab.key)}
                  className="flex-1 flex flex-col items-center gap-1 pt-2.5 pb-1 transition-opacity active:opacity-60"
                >
                  <tab.Icon active={isActive} />
                  <span
                    style={{
                      color: isActive ? "var(--rbr-navigation)" : "var(--rbr-text-muted)",
                      fontFamily: "var(--rbr-font-ui)",
                    }}
                    className="text-[10px] tracking-wide font-medium transition-colors"
                  >
                    {t("flow", tab.labelKey)}
                  </span>
                  <div
                    className="w-4 h-[2px] rounded-full transition-all"
                    style={{ background: isActive ? "var(--rbr-navigation)" : "transparent" }}
                  />
                </button>
              );
            })}
          </div>
          {/* The home-indicator gap, measured rather than assumed: a
              floor of 16px keeps the tab row off the very edge on a
              device that reports no inset at all. */}
          <div style={{ height: "max(env(safe-area-inset-bottom), 16px)" }} />
        </div>
      )}
    </div>
  );
}
