import { PhoneFrame } from "./phone-frame";
import { TodayVisual } from "./product-visuals/today-visual";
import { ScheduleVisual } from "./product-visuals/schedule-visual";
import { MealsVisual } from "./product-visuals/meals-visual";
import { TeamVisual } from "./product-visuals/team-visual";
import { TreatmentsVisual } from "./product-visuals/treatments-visual";
import {
  DEMO_MEALS_VISUAL_ITEMS,
  DEMO_SCHEDULE_VISUAL_DAYS,
  DEMO_SCHEDULE_VISUAL_ITEMS,
  DEMO_TEAM_VISUAL_PEOPLE,
  DEMO_TODAY_VISUAL_ITEMS,
  DEMO_TREATMENTS_VISUAL_ITEMS,
} from "./demo-data";

/**
 * Purpose-built marketing recreations of the five Time to Flow screens (see
 * product-visuals/*.tsx) - not the real Guest App components. The section
 * background stays Deep Forest deliberately (an immersive website moment);
 * the devices themselves are light cream/parchment product UI throughout -
 * dark section, light software, on purpose, never the other way round.
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

        <div className="mt-20 flex items-end justify-center gap-3 flex-wrap lg:flex-nowrap">
          <div className="hidden sm:block translate-y-10 opacity-90 scale-95 z-0 lg:-mr-8">
            <PhoneFrame width={160}>
              <MealsVisual items={DEMO_MEALS_VISUAL_ITEMS} />
            </PhoneFrame>
          </div>
          <div className="hidden lg:block translate-y-4 opacity-95 z-[5] -mr-6">
            <PhoneFrame width={195}>
              <ScheduleVisual days={DEMO_SCHEDULE_VISUAL_DAYS} items={DEMO_SCHEDULE_VISUAL_ITEMS} />
            </PhoneFrame>
          </div>
          <div className="z-20 relative">
            <PhoneFrame width={260} widthLg={370}>
              <TodayVisual retreatName="Samadhi Retreat" dayLabel="Day 2 of 7" items={DEMO_TODAY_VISUAL_ITEMS} />
            </PhoneFrame>
          </div>
          <div className="hidden lg:block translate-y-4 opacity-95 z-[5] -ml-6">
            <PhoneFrame width={195}>
              <TeamVisual people={DEMO_TEAM_VISUAL_PEOPLE} />
            </PhoneFrame>
          </div>
          <div className="hidden sm:block translate-y-10 opacity-90 scale-95 z-0 lg:-ml-8">
            <PhoneFrame width={160}>
              <TreatmentsVisual items={DEMO_TREATMENTS_VISUAL_ITEMS} />
            </PhoneFrame>
          </div>
        </div>
      </div>
    </section>
  );
}
