import { LOCALE_TAG, directionOf, type Locale } from "@/lib/i18n/locales";
import { findCurrency } from "./index";

/**
 * The one formatter for retreat-item prices (Flow Treatments & Extras, Teach
 * My Retreats, the Studio summaries). Separate from billing's money.ts on
 * purpose - that one works in integer minor units for invoices; this one
 * prints what an organizer typed, in major units, and never converts.
 *
 * Rules (TASK 033 plan §4.2.7):
 *   - ISO code: Intl currency style with CLDR's disambiguated symbol
 *     (US$, A$, SGD, €...). Where a locale would print a bare "$" (de, he,
 *     tr for USD), the ISO code is shown instead, so a guest can never
 *     mistake one dollar for another.
 *   - Fraction digits: at least the ISO minor units (JPY 0, KWD 3), and at
 *     most max(minor units, decimals actually stored), so a stored value is
 *     never rounded or hidden (1250.5 JPY stays 1250.5).
 *   - Unrecognised legacy code ("€", "BAHT", "EURO"): locale digits plus the
 *     raw code, exactly as stored. Missing currency: locale digits only.
 *   - RTL locales: the result is wrapped in a Unicode isolate (FSI…PDI) so
 *     it never reorders the text around it (e.g. "Ko Phangan · ₪700").
 *
 * Runtime ICU varies between Node and browsers, so guest-facing callers
 * format on the SERVER and pass the string down; client-only callers (the
 * Studio) format after mount.
 */

const FSI = "⁨";
const PDI = "⁩";
/** Intl rejects more than 20 fraction digits on older engines. */
const MAX_FRACTION = 20;

/** Decimal places actually present in a stored JS number. */
export function storedDecimals(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  let s = String(Math.abs(amount));
  if (/e/i.test(s)) s = Math.abs(amount).toFixed(MAX_FRACTION).replace(/0+$/, "");
  const dot = s.indexOf(".");
  return dot < 0 ? 0 : Math.min(s.length - dot - 1, MAX_FRACTION);
}

function isolate(text: string, locale: Locale): string {
  return directionOf(locale) === "rtl" ? `${FSI}${text}${PDI}` : text;
}

function plainDigits(amount: number, locale: Locale): string {
  const decimals = storedDecimals(amount);
  return new Intl.NumberFormat(LOCALE_TAG[locale], { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(amount);
}

/** True when the formatted currency symbol is a bare "$" (no US/A/SG qualifier). */
function hasBareDollar(parts: Intl.NumberFormatPart[]): boolean {
  return parts.some((p) => p.type === "currency" && p.value.trim() === "$");
}

export function formatPrice(amount: number | null | undefined, currency: string | null | undefined, locale: Locale): string | null {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return null;
  const raw = typeof currency === "string" ? currency.trim() : "";
  const iso = findCurrency(raw);

  if (!iso) {
    const digits = plainDigits(amount, locale);
    return isolate(raw ? `${digits} ${raw}` : digits, locale);
  }

  const minimumFractionDigits = iso.minorUnits;
  const maximumFractionDigits = Math.min(Math.max(iso.minorUnits, storedDecimals(amount)), MAX_FRACTION);
  const options: Intl.NumberFormatOptions = {
    style: "currency",
    currency: iso.code,
    currencyDisplay: "symbol",
    minimumFractionDigits,
    maximumFractionDigits,
  };
  try {
    const symbolFormat = new Intl.NumberFormat(LOCALE_TAG[locale], options);
    const parts = symbolFormat.formatToParts(amount);
    const text = hasBareDollar(parts)
      ? new Intl.NumberFormat(LOCALE_TAG[locale], { ...options, currencyDisplay: "code" }).format(amount)
      : parts.map((p) => p.value).join("");
    return isolate(text, locale);
  } catch {
    return isolate(`${plainDigits(amount, locale)} ${iso.code}`, locale);
  }
}

/**
 * Deterministic pre-mount fallback for client components that cannot use
 * a server-formatted string: locale digits plus the code as stored (the
 * pre-TASK-033 display). Uses only plain number formatting, which is
 * stable across ICU versions for these locales.
 */
export function formatPriceFallback(amount: number | null | undefined, currency: string | null | undefined, locale: Locale): string | null {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return null;
  const raw = typeof currency === "string" ? currency.trim() : "";
  const digits = plainDigits(amount, locale);
  return raw ? `${digits} ${raw}` : digits;
}
