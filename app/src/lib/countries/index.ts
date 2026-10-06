import { COUNTRIES, type Country } from "./data";

export { COUNTRIES };
export type { Country };

/**
 * The shared country API: lookup, validation and search over the one
 * dataset in ./data.ts. Every product, Studio and signup surface reads
 * from here, so "what is a valid country" has exactly one answer.
 *
 * The stored value is always the ISO alpha-2 `code`. Display names are
 * presentation only and will be translated in CP3 without touching any
 * stored data.
 */

const BY_CODE: ReadonlyMap<string, Country> = new Map(COUNTRIES.map((c) => [c.code, c]));

export function findCountry(code: string | null | undefined): Country | null {
  if (!code) return null;
  return BY_CODE.get(code.trim().toUpperCase()) ?? null;
}

/**
 * Valid-only selection: arbitrary typed text is never a country. Used on
 * the server as well as the client, so a tampered form body is rejected
 * at the write boundary rather than trusted.
 */
export function isSupportedCountry(code: unknown): code is string {
  return typeof code === "string" && BY_CODE.has(code.trim().toUpperCase());
}

/** Normalises a candidate to its canonical stored form, or null. */
export function normalizeCountryCode(code: unknown): string | null {
  return isSupportedCountry(code) ? String(code).trim().toUpperCase() : null;
}

/**
 * Lowercase, diacritic-free form for matching. Without this, "Aland",
 * "Curacao", "Reunion" and "Turkiye" find nothing, because the dataset
 * spells them Åland, Curaçao, Réunion and Türkiye - which is exactly what
 * someone types on a keyboard that has no diacritics.
 */
export function foldForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Former or colloquial names people still type. Renames are real: CLDR
 * now says Türkiye, Czechia and Eswatini, and someone searching "Turkey",
 * "Czech Republic" or "Swaziland" must still find them. Matching only, it
 * never changes what is displayed or stored.
 */
const SEARCH_ALIASES: Readonly<Record<string, readonly string[]>> = {
  TR: ["turkey"],
  CZ: ["czech republic"],
  SZ: ["swaziland"],
  MK: ["macedonia"],
  CD: ["congo kinshasa", "drc", "zaire"],
  CG: ["congo brazzaville"],
  NL: ["holland"],
  GB: ["uk", "united kingdom", "britain", "great britain", "england", "scotland", "wales"],
  US: ["usa", "united states of america", "america"],
  AE: ["uae"],
  KR: ["south korea"],
  KP: ["north korea"],
  LA: ["laos"],
  CI: ["ivory coast"],
  CV: ["cape verde"],
  TL: ["east timor"],
  MM: ["burma"],
  VA: ["vatican"],
  SH: ["saint helena"],
  BN: ["brunei"],
  RU: ["russia"],
  BO: ["bolivia"],
  VE: ["venezuela"],
  IR: ["iran"],
  SY: ["syria"],
  TZ: ["tanzania"],
  MD: ["moldova"],
};

type Indexed = { country: Country; haystack: readonly string[]; digits: string };

const INDEX: readonly Indexed[] = COUNTRIES.map((country) => ({
  country,
  haystack: [foldForSearch(country.name), country.code.toLowerCase(), ...(SEARCH_ALIASES[country.code] ?? [])],
  digits: country.dialCode.replace("+", ""),
}));

/**
 * Search by country name (diacritic-insensitive), ISO code, former name
 * or calling code - "972", "+972" and "israel" all find Israel.
 *
 * Ordering is deliberate: a name that STARTS WITH the query outranks one
 * that merely contains it, so typing "ind" offers India before British
 * Indian Ocean Territory. Ties keep the dataset's alphabetical order.
 * An empty query returns everything, so the picker opens as a browsable
 * alphabetical list rather than an empty box.
 */
export function searchCountries(query: string, limit?: number): Country[] {
  const raw = query.trim();
  if (!raw) return limit ? COUNTRIES.slice(0, limit) : [...COUNTRIES];

  const q = foldForSearch(raw);
  const digits = raw.replace(/[^\d]/g, "");

  const scored: { country: Country; rank: number }[] = [];
  for (const entry of INDEX) {
    let rank = Number.POSITIVE_INFINITY;

    if (entry.haystack[0].startsWith(q)) rank = 0;
    else if (entry.country.code.toLowerCase() === q) rank = 1;
    else if (entry.haystack.some((h) => h.startsWith(q))) rank = 2;
    else if (entry.haystack.some((h) => h.includes(q))) rank = 3;

    // Calling-code search only when the query actually looks numeric, so
    // letters never match a dial code by accident.
    if (digits && /^\+?\d+$/.test(raw)) {
      if (entry.digits === digits) rank = Math.min(rank, 1);
      else if (entry.digits.startsWith(digits)) rank = Math.min(rank, 2);
    }

    if (rank !== Number.POSITIVE_INFINITY) scored.push({ country: entry.country, rank });
  }

  scored.sort((a, b) => a.rank - b.rank);
  const result = scored.map((s) => s.country);
  return limit ? result.slice(0, limit) : result;
}
