import { LOCALE_TAG, type Locale } from "@/lib/i18n/locales";

/** A calendar date for account-level billing pages: explicit locale tag, always UTC so server and browser agree. */
export function formatBillingDate(value: Date | string | null | undefined, locale: Locale): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(LOCALE_TAG[locale] ?? "en-GB", { dateStyle: "long", timeZone: "UTC" }).format(d);
}

/** Only https links that come from data are ever rendered as links. */
export function safeHttpsUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && !u.username && !u.password ? u.toString() : null;
  } catch {
    return null;
  }
}
