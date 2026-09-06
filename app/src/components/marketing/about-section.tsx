import Image from "next/image";
import { InnerDweSMark } from "@/components/brand/wordmark";

/**
 * Company-first positioning per the approved direction - no founder
 * portrait, WE language throughout. The panel uses the same pathway
 * environment photograph as the Hero (real retreat architecture/tropical
 * pathway, no people) rather than a placeholder, reused here rather than
 * introducing a third asset. Commercial usage rights confirmed.
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
            Built from real experience inside retreat spaces.
          </h2>
          <div className="font-ui text-idw-parchment/70 mt-6 space-y-4 leading-relaxed max-w-md">
            <p>
              For the past three years, we&apos;ve been managing a retreat center in Thailand,
              while also producing retreats of our own and working closely with facilitators,
              teachers, and groups from around the world.
            </p>
            <p>
              That experience showed us the same problems again and again: scattered
              information, repeated questions, confusing schedule communication, resources
              guests couldn&apos;t find when they needed them, and a steady stream of
              administrative noise that pulled facilitators away from the people in front of
              them.
            </p>
            <p>
              Guests shouldn&apos;t need to search for a printed schedule or ask the same
              practical questions throughout the day. They should be able to stay present,
              connect more deeply with their teacher or facilitator, and access everything that
              supports their journey without technology getting in the way.
            </p>
            <p>
              At the same time, facilitators shouldn&apos;t have to spend their energy
              repeatedly sharing information, managing scattered resources, or answering
              questions that could be handled beautifully and instantly.
            </p>
            <p>That&apos;s why we created InnerDweS.</p>
            <p>
              We build digital experiences that bridge those two worlds. Guests get a simple,
              intuitive way to experience the retreat at its best, while facilitators and
              retreat centers get an effortless way to organize and share everything their
              participants need.
            </p>
            <p>
              Technology should create more space for people to be present, not become another
              distraction. Simple enough to disappear into the background, thoughtful enough to
              make everything easier, and beautifully integrated into the experience itself.
            </p>
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
