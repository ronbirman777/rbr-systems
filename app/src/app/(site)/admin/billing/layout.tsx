import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { requireAdminPage } from "@/lib/billing/admin/auth";
import { getAdminI18n } from "../_lib/i18n";
import { AdminI18nProvider } from "../_components/AdminI18n";
import { AdminLanguageSwitch } from "../_components/AdminLanguageSwitch";
import { AdminNav } from "../_components/AdminNav";

export const dynamic = "force-dynamic";

export default async function BillingAdminLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdminPage();
  const { t, locale, dict } = await getAdminI18n();
  return (
    <AdminI18nProvider dict={dict} locale={locale}>
      <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6">
        <header className="mb-6 border-b border-idw-forest/10 pb-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="font-ui text-lg text-idw-forest">{t("adminName")}</p>
            <div className="flex flex-wrap items-center gap-3 text-xs text-idw-forest/75">
              <span><bdi>{admin.email ?? t("adminFallback")}</bdi> ({admin.role === "owner" ? t("roleOwner") : t("roleBillingAdmin")})</span>
              <Link href="/space" className="inline-flex min-h-11 items-center font-medium underline underline-offset-2">{t("backToSpaces")}</Link>
            </div>
          </div>
          <AdminNav />
          <div className="mt-3">
            <Suspense fallback={null}><AdminLanguageSwitch /></Suspense>
          </div>
        </header>
        <main id="admin-main">{children}</main>
      </div>
    </AdminI18nProvider>
  );
}
