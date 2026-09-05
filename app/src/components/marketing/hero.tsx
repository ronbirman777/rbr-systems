import Image from "next/image";
import { InnerDweSMark } from "@/components/brand/wordmark";
import { HeroParallax } from "./hero-parallax";
import { PhoneFrame } from "./phone-frame";
import { ScheduleScreen } from "@/components/schedule-screen";
import { MealsScreen } from "@/components/meals-screen";
import { DEMO_BRAND, DEMO_MEALS, DEMO_NOW_TIME, DEMO_SCHEDULE, DEMO_TODAY_ISO } from "./demo-data";

/**
 * Entry sequence: mark -> eyebrow -> headline -> supporting copy -> CTAs,
 * staggered opacity+translateY reveals (see globals.css idw-* keyframes) -
 * the same technique family the inspected Superdesign reference uses, no
 * animation library. The background is a real, owned environment
 * photograph (not the unlicensed reference video) with a slow CSS-only
 * "breathing" drift, color-graded toward Deep Forest/Sage rather than the
 * photo's original warm grade - flagged in the implementation report as
 * needing explicit licensing confirmation before launch.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden bg-idw-graphite text-idw-parchment min-h-[92vh] flex items-center">
      <div className="absolute inset-0 idw-hero-drift">
        <HeroParallax>
          <Image
            src="/marketing/hero-pathway.jpg"
            alt=""
            fill
            priority
            className="object-cover [filter:saturate(0.85)_brightness(0.55)_hue-rotate(-8deg)]"
            sizes="100vw"
          />
        </HeroParallax>
      </div>
      {/* Deep Forest grade + haze, over the photograph */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(25,43,33,0.55) 0%, rgba(25,43,33,0.72) 55%, rgba(35,41,38,0.92) 100%)",
        }}
      />

      <div className="relative z-10 mx-auto max-w-[1280px] w-full px-6 py-28 grid lg:grid-cols-[1.1fr_0.9fr] gap-16 items-center">
        <div className="max-w-xl">
          <div className="idw-animate-fade-rise idw-delay-0 mb-6">
            <InnerDweSMark size={40} />
          </div>
          <div className="idw-animate-fade-rise idw-delay-1 font-ui text-xs font-semibold uppercase tracking-[0.22em] text-idw-clay border-b border-idw-clay/40 pb-3 inline-block">
            Digital Wellness Solutions
          </div>
          <h1 className="idw-animate-fade-rise idw-delay-2 font-editorial italic font-light text-[42px] sm:text-[54px] leading-[1.08] mt-6 text-idw-parchment text-balance">
            Your work deserves a digital space{" "}
            <span className="text-idw-clay">that feels like you.</span>
          </h1>
          <p className="idw-animate-fade-rise idw-delay-3 font-ui text-base sm:text-lg text-idw-parchment/70 mt-6 max-w-md leading-relaxed">
            Thoughtful digital experiences for retreats, practitioners and the people they support.
          </p>
          <div className="idw-animate-fade-rise idw-delay-4 flex flex-wrap gap-4 mt-10">
            <a
              href="#flow-showcase"
              className="rounded-full bg-idw-clay text-idw-parchment font-ui text-sm font-semibold uppercase tracking-wide px-7 py-3.5 transition-transform hover:-translate-y-0.5"
            >
              Explore Time to Flow
            </a>
            <a
              href="#about"
              className="rounded-full border border-idw-parchment/40 text-idw-parchment font-ui text-sm font-semibold uppercase tracking-wide px-7 py-3.5 transition-colors hover:bg-idw-parchment/10"
            >
              Discover InnerDweS
            </a>
          </div>
        </div>

        <div className="idw-animate-fade-rise idw-delay-3 hidden lg:flex justify-center items-center gap-6 [perspective:1200px]">
          <div className="rotate-[-6deg] translate-y-6">
            <PhoneFrame width={220}>
              <MealsScreen brand={DEMO_BRAND} meals={DEMO_MEALS} />
            </PhoneFrame>
          </div>
          <div className="rotate-[4deg] -translate-y-4">
            <PhoneFrame width={240}>
              <ScheduleScreen
                brand={DEMO_BRAND}
                schedule={DEMO_SCHEDULE}
                todayIso={DEMO_TODAY_ISO}
                nowTime={DEMO_NOW_TIME}
              />
            </PhoneFrame>
          </div>
        </div>
      </div>
    </section>
  );
}
