"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AdminKey } from "@/lib/billing/admin/ui/labels";
import { useAdminI18n } from "./AdminI18n";

const ITEMS: [string, AdminKey][] = [
  ["/admin/billing", "navOverview"],
  ["/admin/billing/subscriptions", "navSubscriptions"],
  ["/admin/billing/coupons", "navCoupons"],
  ["/admin/billing/payments", "navPayments"],
  ["/admin/billing/audit", "navAudit"],
  ["/admin/billing/settings", "navSettings"],
];
/** Owner-only billing pages (the page itself 404s for anyone else; hiding the link is not the protection). */
const OWNER_ITEMS: [string, AdminKey][] = [["/admin/launch", "navControls"]];

export function AdminNav({ ownerItems = false }: { ownerItems?: boolean }) {
  const path = usePathname();
  const { t } = useAdminI18n();
  return (
    <nav aria-label={t("navAria")} className="flex flex-wrap gap-1.5">
      {(ownerItems ? [...ITEMS, ...OWNER_ITEMS] : ITEMS).map(([href, labelKey]) => {
        const active = href === "/admin/billing" ? path === href : path.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${active ? "bg-idw-forest text-idw-parchment" : "text-idw-forest hover:bg-idw-linen"}`}>
            {t(labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
