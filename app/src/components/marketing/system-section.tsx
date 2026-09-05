import { PhoneFrame } from "./phone-frame";
import { InnerDweSMark } from "@/components/brand/wordmark";
import { TodayScreen } from "@/components/today-screen";
import { DEMO_BRAND, DEMO_SCHEDULE, DEMO_TODAY_ISO } from "./demo-data";

/**
 * Left: the real Creator Workspace visual language, reconstructed as a
 * lightweight browser-chrome mock (the actual configurator UI is a
 * private, authenticated surface - not embeddable here without exposing
 * it publicly). Right: the real, published Guest App output via
 * TodayScreen with demo data - genuinely real, not a mock.
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
          <div className="w-full max-w-2xl rounded-xl overflow-hidden shadow-xl border border-idw-forest/10 bg-idw-forest text-idw-parchment text-left">
            <div className="flex items-center gap-1.5 px-5 py-3.5 bg-black/20">
              <span className="w-2.5 h-2.5 rounded-full bg-red-400/70" />
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-400/70" />
              <span className="w-2.5 h-2.5 rounded-full bg-green-400/70" />
              <span className="ml-3 font-ui text-[12px] text-idw-parchment/50 truncate">
                workspace.innerdwes.com/samadhi
              </span>
            </div>
            <div className="grid grid-cols-[160px_1fr] gap-0 min-h-[380px]">
              <div className="border-r border-idw-parchment/10 py-5 px-4 font-ui text-[15px] text-idw-parchment/60 flex flex-col gap-2">
                <span className="text-idw-parchment font-medium mb-2">Samadhi Retreat</span>
                {["Home", "Brand", "Modules", "Content", "Preview", "Publish"].map((item) => (
                  <span
                    key={item}
                    className={item === "Content" ? "text-idw-clay font-medium" : ""}
                  >
                    {item}
                  </span>
                ))}
              </div>
              <div className="p-6 font-ui text-[15px]">
                <div className="flex items-center justify-between mb-5">
                  <span className="text-idw-parchment/70">Content · Today Overview</span>
                  <span className="text-[12px] text-idw-parchment/40">All saved</span>
                </div>
                {["Welcome Message", "Daily Schedule", "Team Profiles"].map((row) => (
                  <div
                    key={row}
                    className="rounded-lg bg-black/20 px-4 py-3.5 mb-2.5 flex items-center justify-between text-idw-parchment/80"
                  >
                    <span>{row}</span>
                    <span className="text-[11px] uppercase tracking-wide text-idw-clay">Published</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Explicit Creator -> Publish -> Guest connector, not just an
              arrow - makes the value proposition legible without body copy. */}
          <div className="flex lg:flex-col items-center gap-2 shrink-0 px-2">
            <span className="text-idw-clay-text text-2xl rotate-90 lg:rotate-0">→</span>
            <span className="font-ui text-[11px] font-semibold uppercase tracking-[0.14em] text-idw-forest/60 flex items-center gap-1.5">
              <InnerDweSMark size={14} />
              Publish
            </span>
          </div>

          <PhoneFrame width={250} widthLg={300}>
            <TodayScreen tenantName={DEMO_BRAND.name} brand={DEMO_BRAND} schedule={DEMO_SCHEDULE} todayIso={DEMO_TODAY_ISO} />
          </PhoneFrame>
        </div>
      </div>
    </section>
  );
}
