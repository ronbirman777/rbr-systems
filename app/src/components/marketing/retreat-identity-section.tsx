import { PhoneFrame } from "./phone-frame";
import { TodayScreen } from "@/components/today-screen";
import { ATMOSPHERES, PALETTES } from "@/lib/theme/tokens";
import { DEMO_IDENTITIES, DEMO_TODAY_ISO } from "./demo-data";

export function RetreatIdentitySection() {
  return (
    <section className="bg-idw-linen py-28 px-6">
      <div className="mx-auto max-w-[1280px]">
        <div className="font-ui text-xs font-semibold uppercase tracking-[0.22em] text-idw-clay-text mb-4">
          Your Retreat, Your Identity
        </div>
        <h2 className="font-editorial italic font-light text-[36px] sm:text-[44px] leading-[1.15] text-idw-forest text-balance max-w-2xl">
          The same care. A different world.
        </h2>
        <p className="font-ui text-idw-forest/70 mt-6 max-w-xl leading-relaxed">
          The same underlying InnerDweS architecture. Three entirely different retreat identities.
          The system provides the structure — your brand does the rest.
        </p>

        <div className="mt-16 flex flex-wrap justify-center gap-10">
          {DEMO_IDENTITIES.map((identity) => (
            <div key={identity.tenantName} className="flex flex-col items-center gap-4">
              <PhoneFrame width={230}>
                <TodayScreen
                  tenantName={identity.tenantName}
                  brand={identity.brand}
                  schedule={identity.schedule}
                  todayIso={DEMO_TODAY_ISO}
                />
              </PhoneFrame>
              {/* Real product config labels, not invented ones - shows the
                  actual palette + atmosphere axes driving the difference. */}
              <div className="text-center">
                <div className="font-ui text-xs font-semibold text-idw-forest/70">
                  {ATMOSPHERES[identity.brand.atmosphere].label}
                </div>
                <div className="font-ui text-[11px] text-idw-forest/45 mt-0.5">
                  {PALETTES[identity.brand.palette].label} palette
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
