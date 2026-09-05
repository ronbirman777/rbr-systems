import Link from "next/link";

/**
 * Approved commercial direction only - no invented limits, quotas, or
 * feature caps (those are defined later, before Payments). Deliberately
 * does not reuse the stale Figma placeholder ("Pricing details coming
 * soon.") - this is real, current pricing for Time to Flow.
 */
const PLANS = [
  {
    name: "Single Retreat",
    price: "$349",
    period: "one time",
    detail: "Designed for a single retreat or program.",
    cta: { href: "/sign-up", label: "Create Your Space" },
    highlight: false,
  },
  {
    name: "Harmony",
    price: "$59",
    period: "/ month",
    detail: "Designed for ongoing retreat creators.",
    cta: { href: "/sign-up", label: "Create Your Space" },
    highlight: true,
  },
  {
    name: "Time to Elevate",
    price: "Custom",
    period: null,
    detail: "Talk to us.",
    cta: { href: "/time-to-elevate", label: "Talk to us →" },
    highlight: false,
  },
];

export function PricingSection() {
  return (
    <section id="pricing" className="bg-idw-linen py-28 px-6">
      <div className="mx-auto max-w-[1280px] text-center">
        <div className="font-ui text-xs font-semibold uppercase tracking-[0.22em] text-idw-clay-text mb-4">
          Pricing
        </div>
        <h2 className="font-editorial italic font-light text-[36px] sm:text-[44px] leading-[1.15] text-idw-forest text-balance">
          Simple plans for the way you work.
        </h2>
        <p className="font-ui text-idw-forest/60 mt-4">From a single retreat to an ongoing digital ecosystem.</p>

        <div className="mt-16 grid md:grid-cols-3 gap-6 text-left">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl p-8 flex flex-col ${
                plan.highlight
                  ? "bg-idw-forest text-idw-parchment shadow-xl scale-[1.03]"
                  : "bg-idw-parchment text-idw-forest border border-idw-forest/10"
              }`}
            >
              <div className="font-ui text-sm font-semibold uppercase tracking-wide opacity-70">{plan.name}</div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="font-editorial italic text-4xl">{plan.price}</span>
                {plan.period && <span className="text-sm opacity-60">{plan.period}</span>}
              </div>
              <p className="font-ui text-sm mt-4 opacity-70 leading-relaxed flex-1">{plan.detail}</p>
              <Link
                href={plan.cta.href}
                className={`mt-8 inline-flex items-center justify-center rounded-full px-6 py-3 font-ui text-sm font-semibold uppercase tracking-wide transition-transform hover:-translate-y-0.5 ${
                  plan.highlight ? "bg-idw-clay text-idw-parchment" : "bg-idw-forest text-idw-parchment"
                }`}
              >
                {plan.cta.label}
              </Link>
            </div>
          ))}
        </div>

        <p className="font-ui text-xs text-idw-forest/40 mt-10 max-w-md mx-auto">
          Time to Heal is coming soon and is not yet available as a subscription.
        </p>
      </div>
    </section>
  );
}
