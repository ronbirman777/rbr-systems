"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS: [string, string][] = [
  ["/admin/billing", "Overview"],
  ["/admin/billing/subscriptions", "Subscriptions"],
  ["/admin/billing/coupons", "Coupons"],
  ["/admin/billing/payments", "Payments"],
  ["/admin/billing/audit", "Audit"],
  ["/admin/billing/settings", "Settings"],
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav aria-label="Admin" className="flex flex-wrap gap-1.5">
      {ITEMS.map(([href, label]) => {
        const active = href === "/admin/billing" ? path === href : path.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${active ? "bg-idw-forest text-idw-parchment" : "text-idw-forest hover:bg-idw-linen"}`}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
