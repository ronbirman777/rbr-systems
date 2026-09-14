"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { TodayScreen } from "./today-screen";
import { ScheduleScreen } from "./schedule-screen";
import { FacilitatorsScreen } from "./facilitators-screen";
import { ExploreScreen } from "./guest/explore-screen";
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
import type { OptionalModuleKey } from "@/lib/modules/catalog";
import { getDailyQuote } from "@/lib/content/dailyQuotes";

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
  "faq",
  "customPages",
  "stayConnected",
];

type TabDef = {
  key: TabKey;
  label: string;
  Icon: (props: { active?: boolean }) => ReactNode;
  render: (props: GuestAppProps, goTo: (key: TabKey) => void) => ReactNode;
};

const GUEST_TABS: TabDef[] = [
  {
    key: "today",
    label: "Today",
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
        onViewSchedule={props.enabledModules.includes("schedule") ? () => goTo("schedule") : undefined}
        dailyQuote={props.enabledModules.includes("dailyInspiration") ? getDailyQuote(props.todayIso) : null}
      />
    ),
  },
  {
    key: "schedule",
    label: "Schedule",
    Icon: ScheduleIcon,
    render: (props) => (
      <ScheduleScreen brand={props.brand} schedule={props.schedule} todayIso={props.todayIso} nowTime={props.nowTime} />
    ),
  },
  {
    key: "facilitators",
    label: "Team",
    Icon: TeamIcon,
    render: (props) => <FacilitatorsScreen brand={props.brand} facilitators={props.facilitators} />,
  },
  {
    key: "explore",
    label: "Explore",
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
      />
    ),
  },
];

function StatusBar() {
  return (
    <div className="flex-shrink-0 h-11 flex items-center justify-between px-7">
      <span
        style={{ color: "var(--rbr-forest)", fontFamily: "var(--rbr-font-ui)" }}
        className="text-[13px] font-semibold tracking-tight"
      >
        9:41
      </span>
      <div className="flex items-center gap-1.5">
        <svg className="w-4 h-3" viewBox="0 0 17 12" fill="var(--rbr-forest)">
          <rect x="0" y="4" width="3" height="8" rx="0.5" opacity="0.25" />
          <rect x="4.5" y="2.5" width="3" height="9.5" rx="0.5" opacity="0.5" />
          <rect x="9" y="1" width="3" height="11" rx="0.5" opacity="0.75" />
          <rect x="13.5" y="0" width="3" height="12" rx="0.5" />
        </svg>
        <svg className="w-4 h-3" viewBox="0 0 20 14" fill="none" stroke="var(--rbr-forest)" strokeWidth="1.5">
          <path d="M1 5C4.5 2 8.5 0.5 10 0.5C11.5 0.5 15.5 2 19 5" strokeLinecap="round" />
          <path d="M3.5 7.5C6.2 5 8.5 4 10 4C11.5 4 13.8 5 16.5 7.5" strokeLinecap="round" />
          <path d="M6.5 10C8 8.5 9.2 7.8 10 7.8C10.8 7.8 12 8.5 13.5 10" strokeLinecap="round" />
          <circle cx="10" cy="12.5" r="1" fill="var(--rbr-forest)" stroke="none" />
        </svg>
        <div className="flex items-center">
          <div
            className="w-[22px] h-[11px] rounded-[2.5px] p-px"
            style={{ border: "1px solid color-mix(in srgb, var(--rbr-forest) 60%, transparent)" }}
          >
            <div className="w-[16px] h-full rounded-[1.5px]" style={{ background: "var(--rbr-forest)" }} />
          </div>
          <div
            className="w-[2px] h-[5px] rounded-r-sm ml-px"
            style={{ background: "color-mix(in srgb, var(--rbr-forest) 50%, transparent)" }}
          />
        </div>
      </div>
    </div>
  );
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

  const hasExplore = EXPLORE_MODULE_KEYS.some((k) => enabledModules.includes(k));
  const visibleTabs = GUEST_TABS.filter((t) => {
    if (t.key === "today") return true;
    if (t.key === "explore") return hasExplore;
    return enabledModules.includes(t.key as OptionalModuleKey);
  });

  const [active, setActive] = useState<TabKey>("today");
  const current = visibleTabs.find((t) => t.key === active) ?? visibleTabs[0];

  return (
    <div
      style={{ ...vars, background: "var(--rbr-background)" }}
      className="relative w-full h-full flex flex-col overflow-hidden"
    >
      <StatusBar />

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">{current.render(props, setActive)}</div>

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
            {visibleTabs.map((t) => {
              const isActive = current.key === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setActive(t.key)}
                  className="flex-1 flex flex-col items-center gap-1 pt-2.5 pb-1 transition-opacity active:opacity-60"
                >
                  <t.Icon active={isActive} />
                  <span
                    style={{
                      color: isActive ? "var(--rbr-navigation)" : "var(--rbr-text-muted)",
                      fontFamily: "var(--rbr-font-ui)",
                    }}
                    className="text-[10px] tracking-wide font-medium transition-colors"
                  >
                    {t.label}
                  </span>
                  <div
                    className="w-4 h-[2px] rounded-full transition-all"
                    style={{ background: isActive ? "var(--rbr-navigation)" : "transparent" }}
                  />
                </button>
              );
            })}
          </div>
          <div className="h-4" />
        </div>
      )}
    </div>
  );
}
