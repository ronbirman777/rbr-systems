import Image from "next/image";
import { BrowserFrame } from "./browser-frame";
import { PhoneFrame } from "./phone-frame";

/**
 * Wonderland Healing Center - a real, live, bespoke ecosystem built before
 * InnerDweS existed, not a Time to Flow tenant. Every image here is a real
 * screenshot carried over from the old RBR site's own case study
 * (landing/images/wonderland/, copied verbatim into public/marketing/
 * wonderland/) - nothing here is a recreated or fake screen, and nothing
 * about the live Wonderland website or guest app is touched by this
 * section. See the section's own copy for how the past-work/current-product
 * distinction is stated to the reader.
 */
export function SelectedWorkSection() {
  return (
    <section className="bg-idw-linen py-28 px-6">
      <div className="mx-auto max-w-[1280px]">
        <div className="text-center max-w-2xl mx-auto">
          <div className="font-ui text-xs font-semibold uppercase tracking-[0.22em] text-idw-clay-text mb-4">
            Selected Work
          </div>
          <h2 className="font-editorial italic font-light text-[36px] sm:text-[44px] leading-[1.15] text-idw-forest text-balance">
            Where the idea became real.
          </h2>
          <p className="font-ui text-idw-forest/70 mt-6 leading-relaxed">
            A digital ecosystem created inside a working retreat environment, connecting the
            guest journey before arrival and throughout the retreat experience.
          </p>
        </div>

        <div className="mt-14 text-center">
          <div className="font-editorial italic text-2xl text-idw-forest">
            Wonderland Healing Center
          </div>
          <p className="font-ui text-sm text-idw-forest/50 mt-2 max-w-lg mx-auto">
            A bespoke project built before InnerDweS existed - real-world work and experience
            that helped lead to InnerDweS, not a Time to Flow tenant.
          </p>
        </div>

        <div className="mt-16 grid md:grid-cols-2 gap-14 items-start">
          {/* Website */}
          <div className="text-center">
            <div className="font-ui text-xs font-semibold uppercase tracking-[0.18em] text-idw-forest/60 mb-1">
              Website
            </div>
            <div className="font-ui text-sm text-idw-forest/50 mb-8">
              Discovery · Accommodation · Dining · Booking
            </div>

            {/* Desktop/tablet: fanned three-image gallery, real screenshots only */}
            <div className="hidden sm:flex justify-center items-end gap-0">
              <div className="rotate-[-3deg] translate-y-3 -mr-10 z-0 opacity-90 scale-[0.82]">
                <BrowserFrame width={220}>
                  <Image
                    src="/marketing/wonderland/website-accommodations-display.webp"
                    alt="Wonderland Healing Center website - Accommodations page"
                    fill
                    className="object-cover object-top"
                    sizes="220px"
                  />
                </BrowserFrame>
              </div>
              <div className="z-20">
                <BrowserFrame width={300}>
                  <Image
                    src="/marketing/wonderland/website-hero-display.webp"
                    alt="Wonderland Healing Center website homepage"
                    fill
                    className="object-cover object-top"
                    sizes="300px"
                  />
                </BrowserFrame>
              </div>
              <div className="rotate-[3deg] translate-y-3 -ml-10 z-0 opacity-90 scale-[0.82]">
                <BrowserFrame width={220}>
                  <Image
                    src="/marketing/wonderland/website-dining-display.webp"
                    alt="Wonderland Healing Center website - Vegan Dining page"
                    fill
                    className="object-cover object-top"
                    sizes="220px"
                  />
                </BrowserFrame>
              </div>
            </div>

            {/* Mobile: one representative screen, not a shrunk gallery */}
            <div className="sm:hidden flex justify-center">
              <BrowserFrame width={280}>
                <Image
                  src="/marketing/wonderland/website-hero-display.webp"
                  alt="Wonderland Healing Center website homepage"
                  fill
                  className="object-cover object-top"
                  sizes="280px"
                />
              </BrowserFrame>
            </div>

            <a
              href="https://wonderlandhc.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-10 rounded-full border border-idw-forest/25 text-idw-forest font-ui text-sm font-semibold uppercase tracking-wide px-7 py-3 transition-colors hover:bg-idw-forest/5"
            >
              Explore Website →
            </a>
          </div>

          {/* Guest Experience */}
          <div className="text-center">
            <div className="font-ui text-xs font-semibold uppercase tracking-[0.18em] text-idw-forest/60 mb-1">
              Guest Experience
            </div>
            <div className="font-ui text-sm text-idw-forest/50 mb-8">
              Today · Schedule · Meals · Retreat Information
            </div>

            {/* Desktop/tablet: fanned three-phone gallery, real screenshots only */}
            <div className="hidden sm:flex justify-center items-end gap-0">
              <div className="rotate-[-4deg] translate-y-4 -mr-8 z-0 opacity-90">
                <PhoneFrame width={130}>
                  <Image
                    src="/marketing/wonderland/app-schedule-display.webp"
                    alt="Wonderland guest app - Schedule screen"
                    fill
                    className="object-cover"
                    sizes="130px"
                  />
                </PhoneFrame>
              </div>
              <div className="z-20">
                <PhoneFrame width={170}>
                  <Image
                    src="/marketing/wonderland/app-home-display.webp"
                    alt="Wonderland guest app - Home screen"
                    fill
                    className="object-cover"
                    sizes="170px"
                  />
                </PhoneFrame>
              </div>
              <div className="rotate-[4deg] translate-y-4 -ml-8 z-0 opacity-90">
                <PhoneFrame width={130}>
                  <Image
                    src="/marketing/wonderland/app-meals-display.webp"
                    alt="Wonderland guest app - Meals screen"
                    fill
                    className="object-cover"
                    sizes="130px"
                  />
                </PhoneFrame>
              </div>
            </div>

            {/* Mobile: one representative screen, not a shrunk gallery */}
            <div className="sm:hidden flex justify-center">
              <PhoneFrame width={220}>
                <Image
                  src="/marketing/wonderland/app-home-display.webp"
                  alt="Wonderland guest app - Home screen"
                  fill
                  className="object-cover"
                  sizes="220px"
                />
              </PhoneFrame>
            </div>

            <a
              href="https://wonderland-app.netlify.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-10 rounded-full bg-idw-forest text-idw-parchment font-ui text-sm font-semibold uppercase tracking-wide px-7 py-3 transition-transform hover:-translate-y-0.5"
            >
              Open Guest App →
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
