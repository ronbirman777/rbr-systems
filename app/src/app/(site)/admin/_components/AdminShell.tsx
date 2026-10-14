import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import type { AdminContext } from "@/lib/billing/admin/auth";
import { sectionsFor } from "@/lib/admin/sections";
import { getAdminI18n } from "../_lib/i18n";
import { adminEnvironment } from "../_lib/environment";
import { AdminI18nProvider } from "./AdminI18n";
import { AdminLanguageSwitch } from "./AdminLanguageSwitch";
import { AdminSectionNav } from "./AdminSectionNav";

/**
 * The shared Admin console chrome (header, section nav, language). Rendered ONLY by layouts that have already passed
 * requireAdminPage() - it receives the resolved AdminContext and never authorizes anything itself.
 *
 * A role that can open a single section (billing_admin: Revenue & Billing) gets no section nav, so its header is
 * exactly the billing header it had before the console existed.
 */
export async function AdminShell({ admin, subnav, children }: { admin: AdminContext; subnav?: ReactNode; children: ReactNode }) {
  const { t, locale, dict } = await getAdminI18n();
  const sections = sectionsFor(admin.role);
  const env = adminEnvironment();
  return (
    <AdminI18nProvider dict={dict} locale={locale}>
      <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6">
        <header className="mb-6 border-b border-idw-forest/10 pb-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="font-ui text-lg text-idw-forest">{t("adminName")}</p>
            <div className="flex flex-wrap items-center gap-3 text-xs text-idw-forest/75">
              {sections.length > 1 ? <span className="rounded-full border border-idw-forest/20 px-2 py-0.5 font-semibold" data-admin-env={env}>{t("envLabel", { env: t(`env_${env}`) })}</span> : null}
              <span><bdi>{admin.email ?? t("adminFallback")}</bdi> ({admin.role === "owner" ? t("roleOwner") : t("roleBillingAdmin")})</span>
              <Link href="/space" className="inline-flex min-h-11 items-center font-medium underline underline-offset-2">{t("backToSpaces")}</Link>
            </div>
          </div>
          {sections.length > 1 ? <AdminSectionNav items={sections.map((s) => ({ href: s.href, labelKey: s.labelKey, connected: s.connected }))} /> : null}
          {subnav}
          <div className="mt-3">
            <Suspense fallback={null}><AdminLanguageSwitch /></Suspense>
          </div>
        </header>
        <main id="admin-main">{children}</main>
      </div>
    </AdminI18nProvider>
  );
}
