import { notFound, redirect } from "next/navigation";
import { InnerDweSMark } from "@/components/brand/wordmark";
import { BackToSpaces } from "@/components/billing/back-to-spaces";
import { LanguageSwitch } from "@/components/billing/language-switch";
import { getBasePlanPrice, getCreateMode } from "@/lib/billing/funnelMode";
import { FUNNEL_ERROR_CODES, funnelErrorKey } from "@/lib/billing/checkoutView";
import { getAccountLocale } from "@/lib/i18n/accountLocale";
import { directionOf, translate, type TranslationKey } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { CheckoutForm, type CheckoutFormLabels } from "./checkout-form";

const TYPES = { teach: "teach", flow: "retreat" } as const;

export default async function PreCheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string }>;
  searchParams: Promise<{ canceled?: string }>;
}) {
  const { type } = await params;
  if (type !== "teach" && type !== "flow") notFound();
  const spaceType = TYPES[type];
  const { canceled } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/log-in");
  if ((await getCreateMode()) !== "paid") redirect("/create");

  const [locale, price] = await Promise.all([getAccountLocale(), getBasePlanPrice()]);
  const t = (k: TranslationKey<"billing">, v?: Record<string, string | number>) => translate(locale, "billing", k, v);
  if (!price) {
    return (
      <main dir={directionOf(locale)} lang={locale} className="flex-1 bg-idw-parchment px-4 sm:px-6 py-16 text-center">
        <p role="status" className="text-sm text-idw-forest/70">{t("checkoutUnavailable")}</p>
      </main>
    );
  }

  const product = t(type === "teach" ? "productTeach" : "productFlow");
  const errors: Record<string, string> = {};
  for (const c of FUNNEL_ERROR_CODES) errors[c] = t(funnelErrorKey(c));
  const labels: CheckoutFormLabels = {
    dueToday: t("dueToday"), then: t("then"), firstCycle: t("firstCycle"),
    // "{count}" is filled in the browser from the server's quote; every other word is already translated here.
    firstCycles: t("firstCycles", { count: "{count}" }), everyCycle: t("everyCycle"), perMonth: t("perMonth"),
    couponLabel: t("couponLabel"), couponApply: t("couponApply"), couponRemove: t("couponRemove"), couponApplied: t("couponApplied", { code: "{code}" }),
    consentImmediate: t("consentImmediate"), consentWithdrawal: t("consentWithdrawal"), termsLine: t("termsLine"),
    submit: t("continueToPayment"), preparing: t("preparingCheckout"), canceledNotice: t("checkoutCanceled"),
    taxNote: t("taxNote"), perSpaceNote: t("perSpaceNote"), errors,
  };

  return (
    <main dir={directionOf(locale)} lang={locale} className="flex-1 bg-idw-parchment px-4 sm:px-6 py-12 sm:py-16 flex flex-col items-center">
      <div className="w-full max-w-lg">
        <BackToSpaces label={t("backToSpaces")} />
        <InnerDweSMark size={28} className="mb-6" />
        <h1 className="font-ui text-2xl sm:text-3xl text-idw-forest">{t("summaryTitle", { product })}</h1>
        <p className="mt-2 mb-6 text-sm text-idw-forest/60">{t("summaryIntro")}</p>
        <CheckoutForm
          spaceType={spaceType}
          locale={locale}
          canceled={canceled === "1"}
          labels={labels}
          initialQuote={{ currency: price.currency, baseMinor: price.unitAmountMinor, todayMinor: price.unitAmountMinor, discount: null }}
        />
        <div className="mt-10"><LanguageSwitch current={locale} path={`/create/${type}`} label={t("languageLabel")} /></div>
      </div>
    </main>
  );
}
