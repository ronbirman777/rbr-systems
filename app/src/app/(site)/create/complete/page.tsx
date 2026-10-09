import { redirect } from "next/navigation";
import { z } from "zod";
import { InnerDweSMark } from "@/components/brand/wordmark";
import { LanguageSwitch } from "@/components/billing/language-switch";
import { getAccountLocale } from "@/lib/i18n/accountLocale";
import { directionOf, translate, type TranslationKey } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { CompleteStatus, type CompleteLabels } from "./complete-status";

export const dynamic = "force-dynamic";

export default async function CompletePage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/log-in");
  const parsed = z.string().uuid().safeParse(c);
  if (!parsed.success) redirect("/create");

  const locale = await getAccountLocale();
  const t = (k: TranslationKey<"billing">) => translate(locale, "billing", k);
  const labels: CompleteLabels = {
    settingUp: t("settingUpTitle"), hint: t("settingUpHint"), confirmed: t("paymentConfirmed"), stillPreparing: t("stillPreparing"),
    noPaymentYet: t("noPaymentYet"), expired: t("checkoutExpired"), canceled: t("checkoutCanceled"), generic: t("billingErrorGeneric"),
    returnToSpaces: t("returnToSpaces"), reference: t("referenceLabel"),
  };

  return (
    <main dir={directionOf(locale)} lang={locale} className="flex-1 bg-idw-parchment px-4 sm:px-6 py-16 sm:py-20 flex flex-col items-center">
      <div className="w-full max-w-md text-center">
        <InnerDweSMark size={28} className="mx-auto mb-6" />
        <CompleteStatus checkoutId={parsed.data} labels={labels} />
        <div className="mt-12 flex justify-center"><LanguageSwitch current={locale} path={`/create/complete?c=${parsed.data}`} label={t("languageLabel")} /></div>
      </div>
    </main>
  );
}
