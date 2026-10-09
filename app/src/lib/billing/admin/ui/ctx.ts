import { translateAccount } from "@/lib/i18n/account";
import type { Locale } from "@/lib/i18n/locales";
import type { AdminCtx } from "./labels";

/**
 * Server-side (and test) Admin translation context. NOT for client components: it pulls the account
 * dictionaries. Client components receive their context from the Admin provider instead.
 */
export function makeAdminCtx(locale: Locale = "en"): AdminCtx {
  return { locale, t: (key, values) => translateAccount(locale, "admin", key, values) };
}
