import Link from "next/link";
import { InnerDweSMark } from "@/components/brand/wordmark";

/**
 * Redesigned per explicit correction: the earlier version (three large
 * solid Clay/Sage/Forest panels) read as three unrelated SaaS pricing
 * tiers, not one brand family. This version keeps everything on one
 * continuous Cream/Parchment canvas - three spacious editorial cards, all
 * primarily warm-white/Linen, each carrying only a small accent detail (a
 * dot beside the mark, a thin underline) rather than becoming a colored
 * block. The InnerDweS mark repeats across all three as the visual thread
 * tying them together: one system, three expressions.
 */
const FAMILIES = [
  {
    key: "flow",
    name: "Time to Flow",
    kicker: "Retreats · Programs · Trainings",
    quote: "One calm digital space for the entire retreat experience.",
    accentDot: "bg-idw-clay",
    accentLine: "bg-idw-clay/40",
    status: <span className="font-ui text-[11px] font-semibold uppercase tracking-wide text-idw-forest/50">Available now</span>,
    action: { href: "#flow-showcase", label: "Explore Time to Flow →" },
  },
  {
    key: "heal",
    name: "Time to Heal",
    kicker: "Therapists · Healers · Practitioners",
    quote: "Thoughtful continuity between sessions.",
    accentDot: "bg-idw-sage",
    accentLine: "bg-idw-sage/50",
    status: <span className="font-ui text-[11px] font-semibold uppercase tracking-wide text-idw-forest/50">Coming Soon</span>,
    action: { href: "/time-to-heal", label: "Learn more →" },
  },
  {
    key: "elevate",
    name: "Time to Elevate",
    kicker: "Wellness Centers · Organizations · Bespoke",
    quote: "Digital ecosystems shaped around the way your organization works.",
    accentDot: "bg-idw-forest",
    accentLine: "bg-idw-forest/25",
    status: null,
    action: { href: "/time-to-elevate", label: "Talk to us →" },
  },
] as const;

export function ProductFamilySection() {
  return (
    <section id="product-family" className="bg-idw-parchment py-28 px-6">
      <div className="mx-auto max-w-[1280px]">
        <div className="font-ui text-xs font-semibold uppercase tracking-[0.22em] text-idw-clay-text mb-4">
          Product Family
        </div>
        <h2 className="font-editorial italic font-light text-[36px] sm:text-[44px] leading-[1.15] text-idw-forest text-balance max-w-2xl">
          Three paths. One design language.
        </h2>

        <div className="grid md:grid-cols-3 gap-6 mt-16">
          {FAMILIES.map((f) => (
            <div
              key={f.key}
              className="bg-idw-linen/40 border border-idw-forest/8 rounded-2xl p-10 flex flex-col min-h-[340px]"
            >
              <div className="flex items-center gap-2.5 mb-8">
                <InnerDweSMark size={30} />
                <span className={`w-1.5 h-1.5 rounded-full ${f.accentDot}`} aria-hidden="true" />
              </div>
              <div className="font-editorial italic text-idw-forest text-[28px] leading-tight">{f.name}</div>
              <div className={`w-10 h-px ${f.accentLine} my-3`} aria-hidden="true" />
              <div className="font-ui text-[13px] text-idw-forest/60 mb-6">{f.kicker}</div>
              <p className="font-editorial italic text-idw-forest/80 text-lg leading-snug flex-1">
                &ldquo;{f.quote}&rdquo;
              </p>
              <div className="mt-8 flex items-center justify-between gap-3">
                {f.status}
                {f.action.href.startsWith("#") ? (
                  <a
                    href={f.action.href}
                    className="font-ui text-sm font-semibold text-idw-forest underline underline-offset-4"
                  >
                    {f.action.label}
                  </a>
                ) : (
                  <Link
                    href={f.action.href}
                    className="font-ui text-sm font-semibold text-idw-forest underline underline-offset-4"
                  >
                    {f.action.label}
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
