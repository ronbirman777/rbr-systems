"use client";

import { useState, type ReactNode } from "react";
import { TodayScreen } from "./today-screen";
import { ScheduleScreen } from "./schedule-screen";
import { FacilitatorsScreen } from "./facilitators-screen";
import { MealsScreen } from "./meals-screen";
import { TreatmentsScreen } from "./treatments-screen";
import { FacilitiesScreen } from "./facilities-screen";
import { ArrivalScreen } from "./arrival-screen";
import type { BrandConfig } from "@/lib/theme/tokens";
import type { PublicScheduleItem } from "@/lib/schedule/types";
import type { DisplayFacilitator } from "@/lib/modules/facilitator";
import type { DisplayMeal } from "@/lib/modules/meal";
import type { DisplayTreatment } from "@/lib/modules/treatment";
import type { DisplayFacility } from "@/lib/modules/facility";
import type { ArrivalInfo } from "@/lib/modules/arrival";
import { EMPTY_ARRIVAL_INFO } from "@/lib/modules/arrival";
import type { OptionalModuleKey } from "@/lib/modules/catalog";

export type GuestAppProps = {
  tenantName: string;
  brand: BrandConfig;
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
};

type TabKey = "today" | OptionalModuleKey;

type TabDef = {
  key: TabKey;
  label: string;
  render: (props: GuestAppProps, goTo: (key: TabKey) => void) => ReactNode;
};

/**
 * The ordered catalog of every guest-nav-capable destination. "today" is
 * mandatory and always first. Everything else appears only when its
 * module_key is in enabledModules. Adding a future module (resources,
 * general info, contact, audio, announcements...) means adding one entry
 * here with its own dedicated renderer - the shell, tab bar and overflow
 * behavior below never change, so this keeps working as the catalog grows
 * past 6-7 modules, not just up to it.
 */
const GUEST_TABS: TabDef[] = [
  {
    key: "today",
    label: "Today",
    render: (props, goTo) => (
      <TodayScreen
        tenantName={props.tenantName}
        brand={props.brand}
        schedule={props.schedule}
        todayIso={props.todayIso}
        onViewSchedule={
          props.enabledModules.includes("schedule") ? () => goTo("schedule") : undefined
        }
      />
    ),
  },
  {
    key: "schedule",
    label: "Schedule",
    render: (props) => (
      <ScheduleScreen
        brand={props.brand}
        schedule={props.schedule}
        todayIso={props.todayIso}
        nowTime={props.nowTime}
      />
    ),
  },
  {
    key: "facilitators",
    label: "Team",
    render: (props) => <FacilitatorsScreen brand={props.brand} facilitators={props.facilitators} />,
  },
  {
    key: "meals",
    label: "Meals",
    render: (props) => <MealsScreen brand={props.brand} meals={props.meals} />,
  },
  {
    key: "treatments",
    label: "Treatments",
    render: (props) => <TreatmentsScreen brand={props.brand} treatments={props.treatments} />,
  },
  {
    key: "facilities",
    label: "Facilities",
    render: (props) => <FacilitiesScreen brand={props.brand} facilities={props.facilities} />,
  },
  {
    key: "arrivalInfo",
    label: "Arrival",
    render: (props) => <ArrivalScreen brand={props.brand} info={props.arrivalInfo ?? EMPTY_ARRIVAL_INFO} />,
  },
];

/** Direct tabs shown in the bar before the rest collapse into "More" - a
 * count, not a hardcoded set of module keys, so this scales to any future
 * module without touching this file's logic, only GUEST_TABS' entries. */
const MAX_DIRECT_TABS = 4;

/**
 * One fixed InnerDweS-controlled shell. The organizer's enabled_modules
 * decides which tabs exist; everything about how each tab looks, and how
 * navigation itself behaves, is ours. Used identically by the
 * configurator's live preview (fed by draft/local state) and the published
 * guest route (fed by the published_spaces snapshot).
 *
 * With up to 3-4 modules a plain scrollable tab bar reads fine, but past
 * that it starts to feel like a browser full of tabs rather than a calm
 * retreat companion - guests have to scroll sideways to discover what
 * exists at all. Past MAX_DIRECT_TABS, the bar keeps its first few direct
 * destinations and collapses the rest behind one restrained "More" entry
 * that opens a short list in a bottom sheet - still just one tap away,
 * but the bar itself never grows past a fixed, predictable width.
 */
export function GuestApp(props: GuestAppProps) {
  const { enabledModules } = props;
  const visibleTabs = GUEST_TABS.filter(
    (t) => t.key === "today" || enabledModules.includes(t.key as OptionalModuleKey)
  );
  const [active, setActive] = useState<TabKey>("today");
  const [moreOpen, setMoreOpen] = useState(false);
  const current = visibleTabs.find((t) => t.key === active) ?? visibleTabs[0];

  const overflow = visibleTabs.length > MAX_DIRECT_TABS;
  const directTabs = overflow ? visibleTabs.slice(0, MAX_DIRECT_TABS - 1) : visibleTabs;
  const overflowTabs = overflow ? visibleTabs.slice(MAX_DIRECT_TABS - 1) : [];
  const activeIsOverflow = overflow && overflowTabs.some((t) => t.key === current.key);

  function goTo(key: TabKey) {
    setActive(key);
    setMoreOpen(false);
  }

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-hidden">{current.render(props, goTo)}</div>

      {visibleTabs.length > 1 && (
        <div className="flex border-t border-black/10 bg-white/70 shrink-0">
          {directTabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => goTo(t.key)}
              className={`flex-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-2.5 whitespace-nowrap border-b-2 ${
                current.key === t.key ? "text-black border-black" : "text-black/40 border-transparent"
              }`}
            >
              {t.label}
            </button>
          ))}
          {overflow && (
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className={`flex-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-2.5 whitespace-nowrap border-b-2 ${
                activeIsOverflow ? "text-black border-black" : "text-black/40 border-transparent"
              }`}
            >
              {activeIsOverflow ? current.label : "More"}
            </button>
          )}
        </div>
      )}

      {moreOpen && (
        <>
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setMoreOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-x-0 bottom-0 bg-white rounded-t-2xl pb-2 pt-3 shadow-2xl">
            <div className="w-8 h-1 rounded-full bg-black/15 mx-auto mb-2" />
            {overflowTabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => goTo(t.key)}
                className={`w-full text-left px-5 py-3 text-sm border-t border-black/5 first:border-t-0 ${
                  current.key === t.key ? "font-semibold text-black" : "text-black/70"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
