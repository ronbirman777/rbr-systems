import type { ReactNode } from "react";

export const metadata = { title: "InnerDweS Admin", robots: { index: false, follow: false } };

/**
 * Deliberately chrome-free: this layout renders for signed-out visitors and
 * non-admins too (before a page's own gate redirects or 404s), so it must show
 * nothing. The Admin header/nav lives in billing/layout.tsx, behind requireAdminPage().
 * Layouts do not re-run on client navigation, so EVERY page also calls its own gate.
 */
export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return <div className="flex-1 bg-idw-parchment">{children}</div>;
}
