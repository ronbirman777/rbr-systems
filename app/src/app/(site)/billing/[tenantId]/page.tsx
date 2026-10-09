import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { BackToSpaces } from "@/components/billing/back-to-spaces";
import { LanguageSwitch } from "@/components/billing/language-switch";
import { buildBillingPageModel } from "@/lib/billing/billingPageModel";
import { loadBillingView } from "@/lib/billing/customerView";
import { getAccountLocale } from "@/lib/i18n/accountLocale";
import { directionOf, translate, type TranslationKey } from "@/lib/i18n";
import { translateAccount, type AccountKey } from "@/lib/i18n/account";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BillingControls } from "./billing-controls";
import { BillingSections } from "./billing-sections";

export const dynamic = "force-dynamic";

export default async function BillingPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  if (!z.string().uuid().safeParse(tenantId).success) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/log-in");

  // The owner's own session proves ownership (RLS); the admin client only reads the non-sensitive plan/coupon catalog.
  const view = await loadBillingView(supabase, createAdminClient(), tenantId);
  if (!view) notFound();

  const locale = await getAccountLocale();
  const t = (k: AccountKey<"billing">, v?: Record<string, string | number>) => translateAccount(locale, "billing", k, v);
  const model = buildBillingPageModel(view, locale);

  return (
    <main dir={directionOf(locale)} lang={locale} className="flex-1 bg-idw-parchment px-4 sm:px-6 py-10 sm:py-14">
      <div className="mx-auto w-full max-w-2xl">
        <BackToSpaces label={t("backToSpaces")} />
        <h1 className="font-ui text-2xl sm:text-3xl text-idw-forest">{t("billingTitle")}</h1>
        {view.spaceName ? <p className="mt-1 mb-6 text-sm text-idw-forest/60 break-words" dir="auto">{view.spaceName}</p> : <div className="mb-6" />}

        <BillingSections model={model} locale={locale} />

        {model.exempt ? null : (
          <div className="mt-5">
            <BillingControls
              tenantId={tenantId}
              canCancel={model.canCancel}
              canResume={model.canResume}
              canUpdatePayment={model.canUpdatePayment}
              labels={{
                cancelSection: t("cancelSection"), cancelBody: t("cancelBody"), cancelButton: t("cancelButton"),
                confirmTitle: t("cancelConfirmTitle", { space: view.spaceName }), confirmBody: t("cancelConfirmBody", { date: model.cancelDate }),
                confirmYes: t("cancelConfirmYes"), confirmNo: t("cancelConfirmNo"), resume: t("resumeButton"), resumed: t("resumed"),
                updatePayment: t("updatePayment"), error: t("billingErrorGeneric"), cancelScheduled: model.cancelScheduled,
              }}
            />
          </div>
        )}
        <div className="mt-10"><LanguageSwitch current={locale} path={`/billing/${tenantId}`} label={t("languageLabel")} /></div>
      </div>
    </main>
  );
}
