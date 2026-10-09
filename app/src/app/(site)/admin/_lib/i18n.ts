import "server-only";
import { accountDictionary } from "@/lib/i18n/account";
import { getAccountLocale } from "@/lib/i18n/accountLocale";
import { directionOf } from "@/lib/i18n/locales";
import { makeAdminCtx } from "@/lib/billing/admin/ui/ctx";
import type { AdminCtx, AdminKey } from "@/lib/billing/admin/ui/labels";

export type AdminI18n = AdminCtx & { dir: "ltr" | "rtl"; dict: Record<string, string> };

/**
 * The Admin console's language: the same account locale as Billing (cookie -> Accept-Language -> English).
 * `dict` is the resolved dictionary (English underneath, so a missing key falls back deterministically) that the
 * server hands to client components through AdminI18nProvider; Admin copy is never in a Guest bundle.
 */
export async function getAdminI18n(): Promise<AdminI18n> {
  const locale = await getAccountLocale();
  return { ...makeAdminCtx(locale), dir: directionOf(locale), dict: { ...accountDictionary("admin", "en"), ...accountDictionary("admin", locale) } };
}

/** Page <title>: "{page} - InnerDweS Admin" in the account locale. */
export async function adminMetaTitle(pageKey: AdminKey): Promise<{ title: string }> {
  const { t } = await getAdminI18n();
  return { title: t("metaTitle", { page: t(pageKey) }) };
}
