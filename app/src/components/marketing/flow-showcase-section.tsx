import { PhoneFrame } from "./phone-frame";
import { TodayScreen } from "@/components/today-screen";
import { ScheduleScreen } from "@/components/schedule-screen";
import { MealsScreen } from "@/components/meals-screen";
import { FacilitatorsScreen } from "@/components/facilitators-screen";
import { TreatmentsScreen } from "@/components/treatments-screen";
import {
  DEMO_BRAND,
  DEMO_FACILITATORS,
  DEMO_MEALS,
  DEMO_NOW_TIME,
  DEMO_SCHEDULE,
  DEMO_TODAY_ISO,
  DEMO_TREATMENTS,
} from "./demo-data";

/**
 * Every screen below is the REAL Guest App component (today-screen.tsx,
 * schedule-screen.tsx, etc.), fed curated demo props - never a hand-drawn
 * approximation. Four of the five are plain server components with no
 * client JS at all; only ScheduleScreen carries its own small client-side
 * day-selector state, which is a real, useful interaction here too.
 */
export function FlowShowcaseSection() {
  return (
    <section id="flow-showcase" className="bg-idw-forest py-28 px-6 overflow-hidden">
      <div className="mx-auto max-w-[1280px] text-center">
        <h2 className="font-editorial italic font-light text-[36px] sm:text-[48px] leading-[1.15] text-idw-parchment text-balance">
          Everything your guests need.
          <br />
          <span className="text-idw-clay">Nothing they don&apos;t.</span>
        </h2>
        <p className="font-ui text-idw-parchment/60 mt-6 max-w-xl mx-auto leading-relaxed">
          One thoughtfully designed space holds the entire retreat — schedule, team, meals,
          treatments, arrival and more.
        </p>

        {/*
          The Today device is the dominant surface (substantially larger,
          full opacity, top of the stack); Schedule/Team/Meals/Treatments
          recede in size, opacity and z-index around it, overlapping behind
          it (negative margins) rather than sitting as five equal screenshots
          in a row. Mobile shows Today alone - the others stay hidden below
          their sm:/lg: breakpoints exactly as before.
        */}
        <div className="mt-20 flex items-end justify-center gap-3 flex-wrap lg:flex-nowrap">
          <div className="hidden sm:block translate-y-10 opacity-80 scale-95 z-0 lg:-mr-8">
            <PhoneFrame width={150}>
              <MealsScreen brand={DEMO_BRAND} meals={DEMO_MEALS} />
            </PhoneFrame>
          </div>
          <div className="hidden lg:block translate-y-4 opacity-90 z-[5] -mr-6">
            <PhoneFrame width={185}>
              <ScheduleScreen
                brand={DEMO_BRAND}
                schedule={DEMO_SCHEDULE}
                todayIso={DEMO_TODAY_ISO}
                nowTime={DEMO_NOW_TIME}
              />
            </PhoneFrame>
          </div>
          <div className="z-20 relative">
            <PhoneFrame width={250} widthLg={370}>
              <TodayScreen tenantName={DEMO_BRAND.name} brand={DEMO_BRAND} schedule={DEMO_SCHEDULE} todayIso={DEMO_TODAY_ISO} />
            </PhoneFrame>
          </div>
          <div className="hidden lg:block translate-y-4 opacity-90 z-[5] -ml-6">
            <PhoneFrame width={185}>
              <FacilitatorsScreen brand={DEMO_BRAND} facilitators={DEMO_FACILITATORS} />
            </PhoneFrame>
          </div>
          <div className="hidden sm:block translate-y-10 opacity-80 scale-95 z-0 lg:-ml-8">
            <PhoneFrame width={150}>
              <TreatmentsScreen brand={DEMO_BRAND} treatments={DEMO_TREATMENTS} />
            </PhoneFrame>
          </div>
        </div>
      </div>
    </section>
  );
}
