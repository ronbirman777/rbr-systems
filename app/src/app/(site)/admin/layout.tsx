import type { ReactNode } from "react";
import { getAdminI18n } from "./_lib/i18n";

export const metadata = { title: "InnerDweS Admin", robots: { index: false, follow: false } };

/**
 * Deliberately chrome-free: this layout renders for signed-out visitors and
 * non-admins too (before a page's own gate redirects or 404s), so it must show
 * nothing. The Admin header/nav lives in billing/layout.tsx, behind requireAdminPage().
 * Layouts do not re-run on client navigation, so EVERY page also calls its own gate.
 * It only sets the language and reading direction (Hebrew is RTL) for everything below it.
 */
export default async function AdminRootLayout({ children }: { children: ReactNode }) {
  const { locale, dir } = await getAdminI18n();
  return <div lang={locale} dir={dir} className="flex-1 min-w-0 bg-idw-parchment [overflow-wrap:anywhere]">{children}</div>;
}
