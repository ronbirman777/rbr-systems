import type { Locale } from "@/lib/i18n";

/**
 * Money is ALWAYS an integer in the currency's minor unit. Never a float.
 * 2500 USD-minor === $25.00. (All currencies the plan can use here have two
 * decimals; zero-decimal currencies would need an exponent table - assertMinor
 * guards the integer invariant either way.)
 */
export type Minor = number;

export function assertMinor(value: number, label = "amount"): Minor {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer minor amount`);
  return value;
}

const LOCALE_TAG: Record<Locale, string> = { en: "en-US", de: "de-DE", es: "es-ES", fr: "fr-FR", he: "he-IL" };

/**
 * Locale-aware display of a minor amount (server-side / email use). The
 * Intl call formats a Number derived from the integer minor value - the
 * integer itself is never produced from a float.
 */
export function formatMoney(minor: Minor, currency: string, locale: Locale = "en"): string {
  assertMinor(minor);
  return new Intl.NumberFormat(LOCALE_TAG[locale] ?? "en-US", { style: "currency", currency: currency.toUpperCase() }).format(minor / 100);
}

/**
 * Percent discount on a minor amount, rounded half-up to the nearest minor
 * unit, never below zero and never above the amount. percentOff may have up to
 * two decimals (the DB column is numeric(5,2)); basis points keep it integral.
 */
export function percentOffMinor(amount: Minor, percentOff: number): Minor {
  assertMinor(amount);
  if (!(percentOff > 0 && percentOff <= 100)) throw new Error("percentOff out of range");
  const bp = Math.round(percentOff * 100);
  return Math.min(amount, Math.floor((amount * bp + 5000) / 10000));
}
