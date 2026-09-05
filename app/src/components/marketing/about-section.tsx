import Image from "next/image";
import { InnerDweSMark } from "@/components/brand/wordmark";

/**
 * Company-first positioning per the approved direction - no founder
 * portrait, WE language throughout. The panel now uses the same pathway
 * environment photograph as the Hero (real retreat architecture/tropical
 * pathway, no people) rather than a placeholder - it's one of only two
 * images currently treated as provisional staging assets (see Hero,
 * Problem), reused here rather than introducing a third unreviewed one.
 * STILL REQUIRES EXPLICIT RIGHTS CONFIRMATION before production, same as
 * its other uses.
 */
export function AboutSection() {
  return (
    <section id="about" className="bg-idw-forest text-idw-parchment py-28 px-6">
      <div className="mx-auto max-w-[1280px] grid md:grid-cols-2 gap-16 items-center">
        <div>
          <div className="font-ui text-xs font-semibold uppercase tracking-[0.22em] text-idw-clay mb-4">
            About InnerDweS
          </div>
          <h2 className="font-editorial italic font-light text-[32px] sm:text-[40px] leading-[1.2] text-idw-parchment text-balance">
            Built from inside the wellness world.
          </h2>
          <div className="font-ui text-idw-parchment/70 mt-6 space-y-4 leading-relaxed max-w-md">
            <p>We built InnerDweS from inside the wellness world.</p>
            <p>
              After years of working closely with retreats, facilitators and guests, we kept
              seeing the same gap: extraordinary human experiences supported by fragmented
              digital tools.
            </p>
            <p>InnerDweS was created to close that gap.</p>
          </div>
        </div>

        <div className="relative rounded-2xl border border-idw-parchment/15 aspect-[4/3] flex items-center justify-center overflow-hidden">
          <Image
            src="/marketing/hero-pathway.jpg"
            alt=""
            fill
            className="object-cover [filter:saturate(0.8)_brightness(0.5)]"
            sizes="(min-width: 768px) 50vw, 100vw"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 30% 30%, rgba(186,197,178,0.18), transparent 60%), radial-gradient(circle at 75% 80%, rgba(168,103,80,0.16), transparent 60%), linear-gradient(180deg, rgba(25,43,33,0.15), rgba(25,43,33,0.55))",
            }}
          />
          <InnerDweSMark size={90} className="relative opacity-90" />
        </div>
      </div>
    </section>
  );
}
