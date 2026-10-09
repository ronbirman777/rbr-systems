import Link from "next/link";
import { InnerDweSMark } from "@/components/brand/wordmark";
import { BackToSpaces } from "@/components/billing/back-to-spaces";
import { LanguageSwitch } from "@/components/billing/language-switch";
import { PRODUCT_FAMILIES } from "@/lib/brand/productFamilies";
import { demoUrl } from "@/lib/billing/demos";
import { formatMoney } from "@/lib/billing/money";
import type { BasePlanPrice } from "@/lib/billing/funnelMode";
import { directionOf, translate, type Locale, type TranslationKey } from "@/lib/i18n";
import { translateAccount, type AccountKey } from "@/lib/i18n/account";
import { SPACE_TYPES } from "@/lib/spaceTypes/registry";

const t = (locale: Locale, key: AccountKey<"billing">, values?: Record<string, string | number>) => translateAccount(locale, "billing", key, values);

/** Create New Space when paid checkout is enabled: two product cards, price, live example, CTA. No Studio link anywhere. */
export function PaidCreate({ locale, price }: { locale: Locale; price: BasePlanPrice | null }) {
  const priceText = price ? formatMoney(price.unitAmountMinor, price.currency, locale) : null;
  const products = [
    {
      key: "teach" as const,
      name: t(locale, "productTeach"),
      tagline: t(locale, "teachTagline"),
      points: [t(locale, "teachPoint1"), t(locale, "teachPoint2"), t(locale, "teachPoint3")],
      accent: SPACE_TYPES.teach.product.accent,
      accentText: SPACE_TYPES.teach.product.accentText,
      demo: demoUrl("teach"),
      cta: t(locale, "createTeachCta"),
      href: "/create/teach",
    },
    {
      key: "flow" as const,
      name: t(locale, "productFlow"),
      tagline: t(locale, "flowTagline"),
      points: [t(locale, "flowPoint1"), t(locale, "flowPoint2"), t(locale, "flowPoint3")],
      accent: PRODUCT_FAMILIES.retreat.accent,
      accentText: PRODUCT_FAMILIES.retreat.accent,
      demo: demoUrl("retreat"),
      cta: t(locale, "createFlowCta"),
      href: "/create/flow",
    },
  ];

  return (
    <main dir={directionOf(locale)} lang={locale} className="flex-1 bg-idw-parchment px-4 sm:px-6 py-12 sm:py-20 flex flex-col items-center">
      <div className="w-full max-w-4xl">
        <BackToSpaces label={t(locale, "backToSpaces")} />
        <div className="text-center">
          <InnerDweSMark size={28} className="mx-auto mb-6" />
          <h1 className="font-ui text-2xl sm:text-3xl text-idw-forest">{t(locale, "createTitle")}</h1>
          <p className="mt-3 text-sm text-idw-forest/60 max-w-xl mx-auto">{t(locale, "createSubtitle")}</p>
        </div>

        <div className="mt-10 grid md:grid-cols-2 gap-6 text-start">
          {products.map((p) => (
            <section
              key={p.key}
              aria-labelledby={`product-${p.key}`}
              className="flex flex-col rounded-2xl border border-idw-forest/10 bg-white p-6 sm:p-8 pt-6"
              style={{ borderTopColor: p.accent, borderTopWidth: 3 }}
            >
              <div className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: p.accentText }}>
                <h2 id={`product-${p.key}`} className="inline">{p.name}</h2>
              </div>
              <p className="font-editorial italic text-xl sm:text-2xl text-idw-forest mt-3 leading-snug">{p.tagline}</p>
              <ul className="mt-4 space-y-2 text-sm text-idw-forest/70">
                {p.points.map((pt) => (
                  <li key={pt} className="flex gap-2">
                    <span aria-hidden="true" className="text-idw-forest/40">•</span>
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
              {priceText ? (
                <p className="mt-5 text-lg font-semibold text-idw-forest">
                  {priceText} <span className="text-sm font-normal text-idw-forest/60">{t(locale, "perMonth")}</span>
                </p>
              ) : null}
              <p className="mt-1 text-xs text-idw-forest/50">{t(locale, "taxNote")}</p>
              <div className="flex flex-col gap-3 mt-auto pt-6">
                <Link
                  href={p.href}
                  className="inline-flex items-center justify-center text-center min-h-11 px-5 py-2 rounded-full bg-idw-forest text-idw-parchment text-sm font-semibold active:scale-[0.97] motion-reduce:active:scale-100 transition-transform"
                >
                  {p.cta}
                </Link>
                <a
                  href={p.demo}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center text-center min-h-11 px-5 py-2 rounded-full border border-idw-forest/20 text-idw-forest text-sm font-semibold hover:border-idw-forest/50 active:bg-idw-forest/10"
                >
                  {t(locale, "viewExample")}
                </a>
              </div>
            </section>
          ))}
        </div>
        <p className="mt-6 text-center text-xs text-idw-forest/50">{t(locale, "perSpaceNote")}</p>
        <div className="mt-8 flex justify-center">
          <LanguageSwitch current={locale} path="/create" label={t(locale, "languageLabel")} />
        </div>
      </div>
    </main>
  );
}

export function CheckoutUnavailable({ locale }: { locale: Locale }) {
  return (
    <main dir={directionOf(locale)} lang={locale} className="flex-1 bg-idw-parchment px-4 sm:px-6 py-16 sm:py-20 flex flex-col items-center">
      <div className="w-full max-w-md text-center">
        <InnerDweSMark size={28} className="mx-auto mb-6" />
        <p role="status" className="text-sm text-idw-forest/70">{t(locale, "checkoutUnavailable")}</p>
        <Link
          href="/space"
          className="inline-flex items-center justify-center min-h-11 mt-8 text-xs font-semibold uppercase tracking-wide text-idw-forest border border-idw-forest/20 rounded-full px-5 hover:border-idw-forest/50 transition-colors"
        >
          {t(locale, "backToSpaces")}
        </Link>
      </div>
    </main>
  );
}
