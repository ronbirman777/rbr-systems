"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { LanguageSwitch } from "@/components/billing/language-switch";
import { useAdminI18n } from "./AdminI18n";

/** The billing language picker, pointed back at the current Admin page (path + filters) so the choice returns the visitor to where they were. */
export function AdminLanguageSwitch() {
  const { t, locale } = useAdminI18n();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  return <LanguageSwitch current={locale} path={search ? `${pathname}?${search}` : pathname} label={t("languageLabel")} />;
}
