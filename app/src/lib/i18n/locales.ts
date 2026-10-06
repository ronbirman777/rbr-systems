/**
 * The supported system languages, and the direction each one renders in.
 *
 * "System language" is a property of the SPACE, not of the browser. A
 * visitor's device language never changes what a Space renders - an
 * organizer in Tel Aviv can run an English Space for international
 * students, and a German visitor opening a Hebrew Space sees the Hebrew
 * Space. The only thing that decides is `spaceSettings.locale`.
 *
 * English is the canonical fallback. A Space with no locale - which is
 * every Space that exists today - renders exactly the English UI it
 * renders now, so adopting this costs no existing Space anything.
 */

export const SUPPORTED_LOCALES = ["en", "he", "de"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export type Direction = "ltr" | "rtl";

const DIRECTION: Record<Locale, Direction> = {
  en: "ltr",
  he: "rtl",
  de: "ltr",
};

/** Endonyms: a language is listed the way its own speakers write it. */
export const LOCALE_LABEL: Record<Locale, string> = {
  en: "English",
  he: "עברית",
  de: "Deutsch",
};

/**
 * The BCP-47 tag handed to Intl for date/number formatting. Kept separate
 * from the stored locale so a regional variant can be introduced later
 * without migrating any stored value.
 */
export const LOCALE_TAG: Record<Locale, string> = {
  en: "en-GB",
  he: "he-IL",
  de: "de-DE",
};

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** Tolerant read: anything unrecognised resolves to English, never throws. */
export function resolveLocale(value: unknown): Locale {
  return isSupportedLocale(value) ? value : DEFAULT_LOCALE;
}

export function directionOf(locale: Locale): Direction {
  return DIRECTION[locale];
}

export function isRtl(locale: Locale): boolean {
  return DIRECTION[locale] === "rtl";
}

/**
 * Languages to surface first for a Space in `country`.
 *
 * This is a UX convenience and nothing more. It never restricts the
 * choice, never infers anything about who the organizer is, and never
 * changes a locale that has already been set - every supported language
 * stays selectable for every country. Israel and Germany are listed
 * because those are the two markets this release adds; everywhere else
 * simply leads with English.
 */
export function recommendedLocales(country: string | null | undefined): Locale[] {
  switch ((country ?? "").toUpperCase()) {
    case "IL":
      return ["en", "he"];
    case "DE":
    case "AT":
    case "CH":
      return ["en", "de"];
    default:
      return ["en"];
  }
}
