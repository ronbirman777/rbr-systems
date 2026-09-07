"use client";

import { useState, type ReactNode } from "react";
import { PhoneFrame } from "./phone-frame";
import { TodayVisual } from "./product-visuals/today-visual";
import { ScheduleVisual } from "./product-visuals/schedule-visual";
import { MealsVisual } from "./product-visuals/meals-visual";
import { TeamVisual } from "./product-visuals/team-visual";
import { TreatmentsVisual } from "./product-visuals/treatments-visual";
import {
  DEMO_MEALS_VISUAL,
  DEMO_SCHEDULE_VISUAL_DAYS,
  DEMO_SCHEDULE_VISUAL_SESSIONS,
  DEMO_TEAM_VISUAL,
  DEMO_TODAY_VISUAL,
  DEMO_TREATMENTS_VISUAL,
} from "./demo-data";

/**
 * Revives the old RBR site's hover "spotlight" interaction principle (the
 * focused phone comes forward and dominates, its neighbors recede) for the
 * approved InnerDweS fan composition - the interaction concept only, none
 * of the old visual styling. Every base position/rotation/size/opacity/
 * z-index class below is copied unchanged from the previous static
 * flow-showcase-section.tsx - the resting (unhovered) composition is
 * byte-identical to what shipped before this file existed.
 *
 * Client component (unlike the rest of Flow Showcase) only because the
 * "other phones recede" half of the effect needs cross-element awareness
 * a single element's own :hover/:focus can't express - one shared
 * activeIndex drives every phone's state, so mouse hover and keyboard
 * focus produce the exact same visual outcome through the same code path.
 * A real, unaffected :focus-visible ring (native browser input-modality
 * detection, no JS involved) layers on top for keyboard users specifically.
 */
type DeckEntry = {
  key: string;
  label: string;
  baseClassName: string;
  node: ReactNode;
};

const DECK: DeckEntry[] = [
  {
    key: "meals",
    label: "Meals",
    baseClassName: "hidden sm:block translate-y-9 rotate-[-8deg] opacity-95 lg:-mr-7",
    node: (
      <PhoneFrame width={220}>
        <MealsVisual {...DEMO_MEALS_VISUAL} />
      </PhoneFrame>
    ),
  },
  {
    key: "schedule",
    label: "Schedule",
    baseClassName: "hidden lg:block translate-y-3 rotate-[-4deg] -mr-5",
    node: (
      <PhoneFrame width={275}>
        <ScheduleVisual
          retreatName="InnerDweS Review Retreat"
          days={DEMO_SCHEDULE_VISUAL_DAYS}
          sessions={DEMO_SCHEDULE_VISUAL_SESSIONS}
        />
      </PhoneFrame>
    ),
  },
  {
    key: "today",
    label: "Today",
    baseClassName: "",
    node: (
      <PhoneFrame width={300} widthLg={370}>
        <TodayVisual {...DEMO_TODAY_VISUAL} />
      </PhoneFrame>
    ),
  },
  {
    key: "facilitators",
    label: "Facilitators",
    baseClassName: "hidden lg:block translate-y-3 rotate-[4deg] -ml-5",
    node: (
      <PhoneFrame width={275}>
        <TeamVisual {...DEMO_TEAM_VISUAL} />
      </PhoneFrame>
    ),
  },
  {
    key: "treatments",
    label: "Treatments",
    baseClassName: "hidden sm:block translate-y-9 rotate-[8deg] opacity-95 lg:-ml-7",
    node: (
      <PhoneFrame width={220}>
        <TreatmentsVisual {...DEMO_TREATMENTS_VISUAL} />
      </PhoneFrame>
    ),
  },
];

// The fan's original resting z-index per slot - preserved exactly so the
// default composition (nothing focused) is unchanged. Only the active
// phone is ever lifted above all of these.
const BASE_Z = ["z-0", "z-[5]", "z-20", "z-[5]", "z-0"];

function usesRealPointer(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;
}

export function FlowShowcaseDeck() {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  function activate(i: number) {
    setActiveIndex(i);
  }
  function deactivate(i: number) {
    setActiveIndex((current) => (current === i ? null : current));
  }

  return (
    <div className="mt-16 flex items-end justify-center gap-2 flex-wrap lg:flex-nowrap">
      {DECK.map((phone, i) => {
        const isActive = activeIndex === i;
        const isDimmed = activeIndex !== null && !isActive;

        return (
          <div
            key={phone.key}
            tabIndex={0}
            aria-label={`${phone.label} screen preview`}
            onMouseEnter={() => usesRealPointer() && activate(i)}
            onMouseLeave={() => usesRealPointer() && deactivate(i)}
            onFocus={() => activate(i)}
            onBlur={() => deactivate(i)}
            className={[
              phone.baseClassName,
              isActive ? "z-30" : BASE_Z[i],
              "relative rounded-[2.2rem] outline-none cursor-default",
              // scale/opacity for the active/dimmed states are set via
              // inline style below, not classes - two same-specificity
              // utility classes for the same property (the resting
              // opacity-95 on the outer phones vs a dynamic opacity-100)
              // don't reliably override each other by cascade order, and
              // an inline style always wins unambiguously.
              "motion-safe:transition-[scale,opacity] motion-safe:duration-500 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]",
              "focus-visible:ring-2 focus-visible:ring-idw-clay focus-visible:ring-offset-4 focus-visible:ring-offset-idw-forest",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{
              scale: isActive ? "1.1" : isDimmed ? "0.97" : undefined,
              opacity: isActive ? 1 : isDimmed ? 0.6 : undefined,
            }}
          >
            {phone.node}
          </div>
        );
      })}
    </div>
  );
}
