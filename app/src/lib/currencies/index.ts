import { z } from "zod";
import { LOCALE_TAG, type Locale } from "@/lib/i18n/locales";
import { CURRENCIES, type Currency } from "./data";

export { CURRENCIES };
export type { Currency };

/**
 * The shared currency API for RETREAT-ITEM pricing (TASK 033, D-CC3/D-CC4):
 * lookup, validation, localized names and search over the one ISO 4217
 * dataset in ./data.ts.
 *
 * This is informational pricing text an organizer types for a treatment or
 * a retreat. It is completely separate from InnerDweS billing: nothing here
 * imports lib/billing, and nothing in lib/billing reads this (a test
 * enforces the first half). Amounts are never converted between currencies.
 *
 * The stored value is always the ISO code. Legacy rows may hold anything
 * (e.g. "€", "BAHT", "EURO"); readers stay lenient and display those raw,
 * and they are never rewritten.
 */

/** Default for a Space that has never chosen one (owner decision D-CC3). */
export const DEFAULT_SPACE_CURRENCY = "EUR" as const;

/** The pinned "common" group shown above the full list in the picker. */
export const COMMON_CURRENCY_CODES = ["USD", "EUR", "GBP", "THB", "ILS", "TRY", "CHF", "AUD", "SGD"] as const;

const BY_CODE: ReadonlyMap<string, Currency> = new Map(CURRENCIES.map((c) => [c.code, c]));

/** Exact ISO lookup after trim/upper-case, or null. */
export function findCurrency(code: unknown): Currency | null {
  if (typeof code !== "string") return null;
  return BY_CODE.get(code.trim().toUpperCase()) ?? null;
}

export function isIsoCurrency(code: unknown): code is string {
  return findCurrency(code) !== null;
}

/** Canonical stored form ("eur " -> "EUR"), or null when not an active ISO code. */
export function normalizeCurrencyCode(code: unknown): string | null {
  return findCurrency(code)?.code ?? null;
}

/** Strict write-boundary schema: only an active ISO 4217 code passes. */
export const isoCurrencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine((v) => BY_CODE.has(v), { message: "Unknown currency code" });

/**
 * The Space default, resolved: the stored ISO code, or EUR when the Space
 * has none (D-CC3). Never consulted for existing items - it only pre-fills
 * new priced items.
 */
export function resolveSpaceCurrency(stored: unknown): string {
  return normalizeCurrencyCode(stored) ?? DEFAULT_SPACE_CURRENCY;
}

const displayNamesCache = new Map<string, Intl.DisplayNames | null>();

function displayNamesFor(locale: Locale): Intl.DisplayNames | null {
  if (!displayNamesCache.has(locale)) {
    let dn: Intl.DisplayNames | null = null;
    try {
      dn = new Intl.DisplayNames([LOCALE_TAG[locale] ?? "en"], { type: "currency" });
    } catch {
      dn = null;
    }
    displayNamesCache.set(locale, dn);
  }
  return displayNamesCache.get(locale) ?? null;
}

/**
 * Localized currency name via Intl.DisplayNames, falling back to the
 * English dataset name. Runtime ICU varies between hosts, so callers that
 * render on the server AND the client must only use this after mount.
 */
export function currencyDisplayName(code: string, locale: Locale): string {
  const currency = findCurrency(code);
  if (!currency) return code;
  if (locale === "en") return currency.name;
  try {
    const name = displayNamesFor(locale)?.of(currency.code);
    if (name && name !== currency.code) return name;
  } catch {
    // fall through to English
  }
  return currency.name;
}

/** "USD — US Dollar" */
export function currencyLabel(code: string, locale: Locale): string {
  const currency = findCurrency(code);
  return currency ? `${currency.code} — ${currencyDisplayName(currency.code, locale)}` : code;
}

/** Lowercase, diacritic-free form for matching. */
export function foldCurrencySearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Search by code, English name or localized name. Ranking: exact code,
 * code prefix, name prefix, then substring; ties keep dataset order. An
 * empty query returns everything.
 */
export function searchCurrencies(query: string, locale: Locale = "en"): Currency[] {
  const q = foldCurrencySearch(query);
  if (!q) return [...CURRENCIES];
  const scored: { currency: Currency; rank: number }[] = [];
  for (const currency of CURRENCIES) {
    const code = currency.code.toLowerCase();
    const names = [foldCurrencySearch(currency.name)];
    if (locale !== "en") names.push(foldCurrencySearch(currencyDisplayName(currency.code, locale)));
    let rank = Number.POSITIVE_INFINITY;
    if (code === q) rank = 0;
    else if (code.startsWith(q)) rank = 1;
    else if (names.some((n) => n.startsWith(q) || n.split(/\s+/).some((w) => w.startsWith(q)))) rank = 2;
    else if (names.some((n) => n.includes(q))) rank = 3;
    if (rank !== Number.POSITIVE_INFINITY) scored.push({ currency, rank });
  }
  scored.sort((a, b) => a.rank - b.rank);
  return scored.map((s) => s.currency);
}

/**
 * What the picker lists: with an empty query, the pinned common group and
 * then every other code (no duplicates, so each option id is unique); with
 * a query, one ranked list of matches.
 */
export function currencyPickerOptions(query: string, locale: Locale = "en"): { common: Currency[]; rest: Currency[] } {
  if (query.trim()) return { common: [], rest: searchCurrencies(query, locale) };
  const pinnedSet = new Set<string>(COMMON_CURRENCY_CODES);
  const common = COMMON_CURRENCY_CODES.map((c) => BY_CODE.get(c)).filter((c): c is Currency => c !== undefined);
  return { common, rest: CURRENCIES.filter((c) => !pinnedSet.has(c.code)) };
}
