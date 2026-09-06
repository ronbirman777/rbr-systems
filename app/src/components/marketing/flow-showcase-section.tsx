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
 * Purpose-built marketing recreations of the five Time to Flow screens (see
 * product-visuals/*.tsx), rebuilt to match the supplied premium product
 * reference screenshots directly - photography-forward, editorial, fewer
 * and larger elements per screen. Section background stays Deep Forest
 * deliberately; the devices themselves are light cream/parchment product UI
 * throughout. Editorial fan composition: Today dominant but not towering,
 * Schedule and Team with substantial presence, Meals and Treatments
 * slightly smaller - overlap and rotation for depth, not five equal phones
 * in a row and not four tiny satellites clinging to one giant center.
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

        <div className="mt-16 flex items-end justify-center gap-2 flex-wrap lg:flex-nowrap">
          <div className="hidden sm:block translate-y-9 rotate-[-8deg] opacity-95 z-0 lg:-mr-7">
            <PhoneFrame width={220}>
              <MealsVisual {...DEMO_MEALS_VISUAL} />
            </PhoneFrame>
          </div>
          <div className="hidden lg:block translate-y-3 rotate-[-4deg] z-[5] -mr-5">
            <PhoneFrame width={275}>
              <ScheduleVisual
                retreatName="InnerDweS Review Retreat"
                days={DEMO_SCHEDULE_VISUAL_DAYS}
                sessions={DEMO_SCHEDULE_VISUAL_SESSIONS}
              />
            </PhoneFrame>
          </div>
          <div className="z-20 relative">
            <PhoneFrame width={300} widthLg={370}>
              <TodayVisual {...DEMO_TODAY_VISUAL} />
            </PhoneFrame>
          </div>
          <div className="hidden lg:block translate-y-3 rotate-[4deg] z-[5] -ml-5">
            <PhoneFrame width={275}>
              <TeamVisual {...DEMO_TEAM_VISUAL} />
            </PhoneFrame>
          </div>
          <div className="hidden sm:block translate-y-9 rotate-[8deg] opacity-95 z-0 lg:-ml-7">
            <PhoneFrame width={220}>
              <TreatmentsVisual {...DEMO_TREATMENTS_VISUAL} />
            </PhoneFrame>
          </div>
        </div>
      </div>
    </section>
  );
}
