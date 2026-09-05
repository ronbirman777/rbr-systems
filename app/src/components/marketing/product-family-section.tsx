import Link from "next/link";
import { InnerDweSMark } from "@/components/brand/wordmark";

const FAMILIES = [
  {
    key: "flow",
    eyebrow: "Time to Flow",
    kicker: "Retreats · Programs · Trainings",
    quote: "One calm digital space for the entire retreat experience.",
    bg: "bg-idw-clay",
    text: "text-idw-parchment",
    ring: "border-idw-parchment/50",
    status: <span className="rounded-full bg-idw-parchment/20 px-3 py-1 text-xs font-ui font-semibold">Available now</span>,
    action: { href: "#flow-showcase", label: "Explore Time to Flow →" },
  },
  {
    key: "heal",
    eyebrow: "Time to Heal",
    kicker: "Therapists · Healers · Practitioners",
    quote: "Thoughtful continuity between sessions.",
    bg: "bg-idw-sage",
    text: "text-idw-forest",
    ring: "border-idw-forest/30",
    status: <span className="rounded-full bg-idw-forest/10 px-3 py-1 text-xs font-ui font-semibold text-idw-forest">Coming Soon</span>,
    action: { href: "/time-to-heal", label: null },
  },
  {
    key: "elevate",
    eyebrow: "Time to Elevate",
    kicker: "Wellness Centers · Organizations · Bespoke",
    quote: "Digital ecosystems shaped around the way your organization works.",
    bg: "bg-idw-forest",
    text: "text-idw-parchment",
    ring: "border-idw-parchment/30",
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

        <div className="grid md:grid-cols-3 mt-16 rounded-2xl overflow-hidden shadow-xl">
          {FAMILIES.map((f) => (
            <div key={f.key} className={`${f.bg} ${f.text} p-10 flex flex-col min-h-[320px]`}>
              <div className={`w-9 h-9 rounded-full border ${f.ring} flex items-center justify-center mb-6`}>
                <InnerDweSMark size={16} />
              </div>
              <div className="font-editorial italic text-2xl leading-tight mb-1.5">{f.eyebrow}</div>
              <div className="font-ui text-[13px] font-medium opacity-75 mb-4">{f.kicker}</div>
              <p className="font-editorial italic text-xl leading-snug flex-1">&ldquo;{f.quote}&rdquo;</p>
              <div className="mt-8 flex items-center justify-between gap-3">
                {f.status}
                {f.action.label &&
                  (f.action.href.startsWith("#") ? (
                    <a href={f.action.href} className="font-ui text-sm font-semibold underline underline-offset-4">
                      {f.action.label}
                    </a>
                  ) : (
                    <Link href={f.action.href} className="font-ui text-sm font-semibold underline underline-offset-4">
                      {f.action.label}
                    </Link>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
