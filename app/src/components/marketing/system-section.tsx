import { PhoneFrame } from "./phone-frame";
import { InnerDweSMark } from "@/components/brand/wordmark";
import { TodayVisual } from "./product-visuals/today-visual";
import { DEMO_TODAY_VISUAL } from "./demo-data";

/**
 * "Time to Flow Studio" marketing representation (public-facing name for
 * what the product internally still calls the Creator/configurator - see
 * the terminology note in the commercial positioning update; internal
 * routes/code aren't renamed yet, this is a marketing-copy-only label),
 * designed fresh in InnerDweS's light product direction (Parchment/Linen
 * surfaces, warm-white cards, Sage for quiet secondary surfaces, Clay for
 * interaction/active states, Forest reserved for typography and the
 * selected nav item) - a deliberate departure from the dark-toned mock in
 * the original homepage Figma reference, per explicit approval. The
 * information architecture (Home/Brand/Modules/Content/Preview/Publish,
 * content rows with a Published/Editing status) mirrors what the real
 * Creator Workspace actually does - nothing here is an invented
 * capability, only the visual skin and the public-facing name changed.
 * Right side reuses TodayVisual (not the real TodayScreen) so both halves
 * of "Studio -> Publish -> Guest" read as one consistent premium system.
 */
export function SystemSection() {
  return (
    <section id="system" className="bg-idw-linen py-28 px-6">
      <div className="mx-auto max-w-[1280px] text-center">
        <div className="font-ui text-xs font-semibold uppercase tracking-[0.22em] text-idw-clay-text mb-4">
          The System
        </div>
        <h2 className="font-editorial italic font-light text-[36px] sm:text-[44px] leading-[1.15] text-idw-forest text-balance">
          You shape the experience.
          <br />
          InnerDweS takes care of the system.
        </h2>

        <div className="mt-16 flex flex-col lg:flex-row items-center justify-center gap-6 lg:gap-2">
          <div className="w-full max-w-2xl rounded-2xl overflow-hidden shadow-xl border border-idw-forest/10 bg-idw-parchment text-left">
            <div className="flex items-center gap-1.5 px-5 py-3.5 bg-white/70 border-b border-idw-forest/10">
              <span className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-400/60" />
              <span className="w-2.5 h-2.5 rounded-full bg-green-400/60" />
              <span className="ml-3 font-ui text-[12px] text-idw-forest/40 truncate">
                workspace.innerdwes.com/samadhi
              </span>
            </div>
            <div className="grid grid-cols-[170px_1fr] gap-0 min-h-[380px]">
              <div className="border-r border-idw-forest/10 py-5 px-4 font-ui text-[15px] text-idw-forest/55 flex flex-col gap-2 bg-idw-linen/50">
                <span className="font-ui text-[9px] font-semibold uppercase tracking-[0.14em] text-idw-clay-text">
                  Time to Flow Studio
                </span>
                <span className="font-editorial italic text-idw-forest text-base mb-2">Samadhi Retreat</span>
                {["Home", "Brand", "Modules", "Content", "Preview", "Publish"].map((item) => (
                  <span
                    key={item}
                    className={
                      item === "Content"
                        ? "text-idw-clay-text font-semibold"
                        : "hover:text-idw-forest transition-colors"
                    }
                  >
                    {item}
                  </span>
                ))}
              </div>
              <div className="p-7 font-ui text-[15px] bg-idw-parchment">
                <div className="flex items-center justify-between mb-6">
                  <span className="font-editorial italic text-idw-forest text-lg">Today Overview</span>
                  <span className="text-[11px] text-idw-forest/35">Autosaved 2 min ago</span>
                </div>

                <div className="rounded-xl bg-white border border-idw-clay/30 px-4 py-3.5 mb-3 shadow-[0_1px_2px_rgba(25,43,33,0.04)]">
                  <div className="flex items-center justify-between">
                    <span className="text-idw-forest/85">Daily Schedule</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full bg-idw-clay/15 text-idw-clay-text">
                      Editing
                    </span>
                  </div>
                  <div className="h-px bg-idw-forest/8 my-2.5" />
                  <div className="text-[13px] text-idw-forest/45">Morning Grounding · 06:30 · Yoga Shala</div>
                </div>

                {["Welcome Message", "Team Profiles"].map((row) => (
                  <div
                    key={row}
                    className="rounded-xl bg-white/60 px-4 py-3.5 mb-3 flex items-center justify-between text-idw-forest/70"
                  >
                    <span>{row}</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full bg-idw-sage/35 text-idw-forest">
                      Published
                    </span>
                  </div>
                ))}

                <div className="mt-5 flex items-center gap-3">
                  <div className="inline-flex items-center rounded-full bg-idw-clay text-idw-parchment font-ui text-[13px] font-semibold px-5 py-2.5 transition-transform hover:-translate-y-0.5">
                    Publish →
                  </div>
                  <span className="font-ui text-[12px] text-idw-forest/40 underline underline-offset-2">Preview first</span>
                </div>
              </div>
            </div>
          </div>

          {/* Explicit Studio -> Publish -> Guest connector, not just an
              arrow - makes the value proposition legible without body copy. */}
          <div className="flex lg:flex-col items-center gap-2 shrink-0 px-2">
            <span className="text-idw-clay-text text-2xl rotate-90 lg:rotate-0">→</span>
            <span className="font-ui text-[11px] font-semibold uppercase tracking-[0.14em] text-idw-forest/60 flex items-center gap-1.5">
              <InnerDweSMark size={14} />
              Publish
            </span>
          </div>

          <PhoneFrame width={250} widthLg={300}>
            <TodayVisual {...DEMO_TODAY_VISUAL} />
          </PhoneFrame>
        </div>
      </div>
    </section>
  );
}
