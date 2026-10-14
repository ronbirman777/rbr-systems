"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AdminKey } from "@/lib/billing/admin/ui/labels";
import { useAdminI18n } from "./AdminI18n";

/**
 * Top-level navigation across the Admin sections. The server passes ONLY the sections this admin's role may open
 * (lib/admin/sections.ts); hiding a link is never the protection - every section page runs its own role gate.
 */
export function AdminSectionNav({ items }: { items: { href: string; labelKey: AdminKey; connected: boolean }[] }) {
  const path = usePathname();
  const { t } = useAdminI18n();
  return (
    <nav aria-label={t("secNavAria")} className="mb-3 flex flex-wrap gap-1.5">
      {items.map(({ href, labelKey, connected }) => {
        const active = path === href || path.startsWith(`${href}/`);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-xl border px-3 text-sm font-semibold ${active ? "border-idw-forest bg-idw-forest text-idw-parchment" : connected ? "border-idw-forest/20 text-idw-forest hover:bg-idw-linen" : "border-dashed border-idw-forest/25 text-idw-forest/75 hover:bg-idw-linen"}`}>
            {t(labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
