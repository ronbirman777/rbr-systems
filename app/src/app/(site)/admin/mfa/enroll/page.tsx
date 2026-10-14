import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireAdminForMfaPages, requireAdminPage } from "@/lib/billing/admin/auth";
import { AdminI18nProvider } from "../../_components/AdminI18n";
import { AdminLanguageSwitch } from "../../_components/AdminLanguageSwitch";
import { MfaEnroll } from "../../_components/MfaForms";
import { adminMetaTitle, getAdminI18n } from "../../_lib/i18n";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { ...(await adminMetaTitle("metaMfaEnroll")), robots: { index: false, follow: false } };
}

const RECOVERY_DOC = "docs/billing/ADMIN-RECOVERY.md";

/**
 * First enrolment (no AAL2 yet), or `?add=1`: add a BACKUP authenticator from a fresh step-up session (owner
 * recommendation: at least two TOTP factors, so one lost device never locks an admin out).
 */
export default async function EnrollPage({ searchParams }: { searchParams?: Promise<{ add?: string }> } = {}) {
  const sp = (await searchParams) ?? {};
  const who = await requireAdminForMfaPages();
  const adding = who.aal2 && sp.add === "1";
  if (who.aal2 && !adding) redirect("/admin");
  if (adding) await requireAdminPage({ recentMfa: true });
  const { t, locale, dict } = await getAdminI18n();
  return (
    <AdminI18nProvider dict={dict} locale={locale}>
    <main className="mx-auto w-full max-w-lg px-4 py-10 sm:py-16">
      <p className="text-xs font-semibold uppercase tracking-wide text-idw-forest/70">{t("adminName")}</p>
      <h1 className="mt-1 font-ui text-2xl text-idw-forest sm:text-3xl">{adding ? t("mfaAddTitle") : t("mfaEnrollTitle")}</h1>
      <p className="mb-6 mt-2 text-sm text-idw-forest/80">{adding ? t("mfaAddIntro") : t("mfaEnrollIntro")}</p>
      <div className="rounded-2xl border border-idw-forest/10 bg-white/70 p-5">
        <MfaEnroll />
      </div>
      <p className="mt-6 text-xs text-idw-forest/70">{t("mfaLost", { doc: RECOVERY_DOC })}</p>
      <div className="mt-6"><Suspense fallback={null}><AdminLanguageSwitch /></Suspense></div>
    </main>
    </AdminI18nProvider>
  );
}
