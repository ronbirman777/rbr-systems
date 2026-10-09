import "server-only";
import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, isSupportedLocale, type Locale } from "./locales";

/**
 * The locale for ACCOUNT-level pages (Create New Space funnel, Billing / Plan)
 * - surfaces that exist before, or outside, any one Space. (A Space's own
 * language setting continues to govern Studio and its Guest App.)
 *
 * Order: the visitor's explicit choice (cookie) -> their browser's
 * Accept-Language -> English. No network, no account table, no tracking: the
 * cookie holds only the language code the visitor picked.
 */
export const ACCOUNT_LOCALE_COOKIE = "idw_locale";

/** First supported language in an Accept-Language header, honouring q-weights. */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale | null {
  if (!acceptLanguage) return null;
  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = Number(params.find((p) => p.trim().startsWith("q="))?.split("=")[1] ?? "1");
      return { primary: tag.trim().toLowerCase().split("-")[0], q: Number.isFinite(q) ? q : 0 };
    })
    .filter((x) => x.q > 0)
    .sort((a, b) => b.q - a.q);
  // "iw" is the legacy ISO code browsers still send for Hebrew.
  for (const { primary } of ranked) {
    const normalised = primary === "iw" ? "he" : primary;
    if (isSupportedLocale(normalised)) return normalised;
  }
  return null;
}

export async function getAccountLocale(): Promise<Locale> {
  const chosen = (await cookies()).get(ACCOUNT_LOCALE_COOKIE)?.value;
  if (isSupportedLocale(chosen)) return chosen;
  return negotiateLocale((await headers()).get("accept-language")) ?? DEFAULT_LOCALE;
}

export { SUPPORTED_LOCALES };
