import Link from "next/link";

/**
 * Approved commercial direction only - no invented limits, quotas, or
 * feature caps. Time to Flow is one simple subscription, not a tiered
 * lineup - "Done For You Setup" is an optional one-time add-on inside that
 * same card, never a competing plan. No annual-commitment language, no
 * hidden tiers.
 */
const PLANS = [
  {
    name: "Time to Flow",
    price: "$29",
    period: "/ month",
    detail: "Cancel anytime. Create, customize and publish your retreat space for as long as you're subscribed.",
    cta: { href: "/sign-up", label: "Create Your Space" },
    highlight: true,
    addOn: {
      label: "Prefer us to set it up for you?",
      detail:
        "Send us your retreat information, schedule, facilitators, branding and content, and we'll set up your Time to Flow space for you.",
      price: "+$99 one time",
    },
  },
  {
    name: "Time to Heal",
    price: null,
    period: null,
    detail: "Coming Soon",
    cta: { href: "/time-to-heal", label: "Learn more →" },
    highlight: false,
    addOn: null,
  },
  {
    name: "Time to Elevate",
    price: "Custom",
    period: null,
    detail: "Talk to us.",
    cta: { href: "/time-to-elevate", label: "Talk to us →" },
    highlight: false,
    addOn: null,
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
        <p className="font-ui text-idw-forest/60 mt-4">One space. One subscription. No hidden tiers.</p>

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
              {plan.price ? (
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="font-editorial italic text-4xl">{plan.price}</span>
                  {plan.period && <span className="text-sm opacity-60">{plan.period}</span>}
                </div>
              ) : (
                <div className="mt-4 font-editorial italic text-2xl opacity-80">Coming Soon</div>
              )}
              {plan.price && <p className="font-ui text-sm mt-4 opacity-70 leading-relaxed">{plan.detail}</p>}

              {plan.addOn && (
                <div className="mt-6 pt-6 border-t border-idw-parchment/15">
                  <div className="font-ui text-sm font-semibold">{plan.addOn.label}</div>
                  <p className="font-ui text-[13px] opacity-70 leading-relaxed mt-1.5">{plan.addOn.detail}</p>
                  <div className="font-ui text-sm font-semibold text-idw-clay mt-2">{plan.addOn.price}</div>
                </div>
              )}

              <div className={plan.addOn ? "mt-6" : "mt-auto pt-6"}>
                <Link
                  href={plan.cta.href}
                  className={`inline-flex items-center justify-center rounded-full px-6 py-3 font-ui text-sm font-semibold uppercase tracking-wide transition-transform hover:-translate-y-0.5 ${
                    plan.highlight ? "bg-idw-clay text-idw-parchment" : "bg-idw-forest text-idw-parchment"
                  }`}
                >
                  {plan.cta.label}
                </Link>
              </div>
            </div>
          ))}
        </div>

        <p className="font-ui text-xs text-idw-forest/40 mt-10 max-w-lg mx-auto leading-relaxed">
          When a Time to Flow subscription ends, the public guest space goes offline at the end of the billing
          period - your content stays saved in your account, ready to reactivate whenever you return.
        </p>
      </div>
    </section>
  );
}
