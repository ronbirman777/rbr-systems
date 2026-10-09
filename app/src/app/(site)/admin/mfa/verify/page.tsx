import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireAdminForMfaPages } from "@/lib/billing/admin/auth";
import { safeInternalRedirectPath } from "@/lib/safe-redirect";
import { AdminI18nProvider } from "../../_components/AdminI18n";
import { AdminLanguageSwitch } from "../../_components/AdminLanguageSwitch";
import { MfaVerify } from "../../_components/MfaForms";
import { adminMetaTitle, getAdminI18n } from "../../_lib/i18n";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { ...(await adminMetaTitle("metaMfaVerify")), robots: { index: false, follow: false } };
}

const RECOVERY_DOC = "docs/billing/ADMIN-RECOVERY.md";

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ next?: string; stepup?: string }> }) {
  const sp = await searchParams;
  const who = await requireAdminForMfaPages();
  const stepUp = sp.stepup === "1";
  if (who.aal2 && !stepUp) redirect("/admin/billing");
  const next = safeInternalRedirectPath(typeof sp.next === "string" ? sp.next : null, "/admin/billing");
  const { t, locale, dict } = await getAdminI18n();
  return (
    <AdminI18nProvider dict={dict} locale={locale}>
    <main className="mx-auto w-full max-w-lg px-4 py-10 sm:py-16">
      <p className="text-xs font-semibold uppercase tracking-wide text-idw-forest/70">{t("adminName")}</p>
      <h1 className="mt-1 font-ui text-2xl text-idw-forest sm:text-3xl">{stepUp ? t("mfaVerifyStepUpTitle") : t("mfaVerifyTitle")}</h1>
      <p className="mb-6 mt-2 text-sm text-idw-forest/80">
        {stepUp ? t("mfaVerifyStepUpIntro") : t("mfaVerifyIntro")}
      </p>
      <div className="rounded-2xl border border-idw-forest/10 bg-white/70 p-5">
        <MfaVerify next={next} />
      </div>
      <p className="mt-6 text-xs text-idw-forest/70">{t("mfaLost", { doc: RECOVERY_DOC })}</p>
      <div className="mt-6"><Suspense fallback={null}><AdminLanguageSwitch /></Suspense></div>
    </main>
    </AdminI18nProvider>
  );
}
