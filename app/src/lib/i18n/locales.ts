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

/**
 * The supported languages, IN SELECTOR ORDER.
 *
 * This array is the display order, and it is fixed: English, Deutsch,
 * Español, Français, then עברית last. Hebrew is last because it is the
 * only RTL language here and moving it around the list is the kind of
 * churn a returning organizer notices.
 *
 * Country recommendations deliberately do NOT reorder it (see
 * `recommendedLocales`): a recommendation is a badge on an option, not a
 * different list. Reordering would mean the same selector presents its
 * options differently per Space, and an organizer who learned where
 * their language sits would have to find it again.
 */
export const SUPPORTED_LOCALES = ["en", "de", "es", "fr", "he"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export type Direction = "ltr" | "rtl";

const DIRECTION: Record<Locale, Direction> = {
  en: "ltr",
  de: "ltr",
  es: "ltr",
  fr: "ltr",
  he: "rtl",
};

/** Endonyms: a language is listed the way its own speakers write it. */
export const LOCALE_LABEL: Record<Locale, string> = {
  en: "English",
  de: "Deutsch",
  es: "Español",
  fr: "Français",
  he: "עברית",
};

/**
 * The BCP-47 tag handed to Intl for date/number formatting. Kept separate
 * from the stored locale so a regional variant can be introduced later
 * without migrating any stored value.
 */
export const LOCALE_TAG: Record<Locale, string> = {
  en: "en-GB",
  de: "de-DE",
  // Neutral international variants on purpose: a Space is not pinned to
  // one country, and es-ES / fr-FR would impose a regional date and
  // number format on an organizer in Mexico or Quebec.
  es: "es-419",
  fr: "fr-FR",
  he: "he-IL",
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
 * choice, never REORDERS the selector, never infers anything about who
 * the organizer is, and never changes a locale that has already been
 * set. Every supported language stays selectable for every country - a
 * German studio running an English retreat for international guests is
 * an ordinary case, not a mistake to be corrected.
 *
 * The country is the SPACE's country, which an organizer chose; it is
 * not geolocation and it is not identity. "Recommended" means "this is
 * probably what your guests read", nothing more.
 */
export function recommendedLocales(country: string | null | undefined): Locale[] {
  switch ((country ?? "").toUpperCase()) {
    case "IL":
      return ["en", "he"];
    // German-speaking
    case "DE":
    case "AT":
    case "CH":
    case "LI":
      return ["en", "de"];
    // Spanish-speaking. Spain plus Latin America, because "Spanish
    // retreat" is at least as likely in Mexico or Costa Rica as in
    // Andalusia.
    case "ES":
    case "MX":
    case "AR":
    case "CO":
    case "CL":
    case "PE":
    case "UY":
    case "CR":
    case "GT":
    case "EC":
    case "BO":
    case "PY":
    case "PA":
    case "DO":
    case "SV":
    case "HN":
    case "NI":
    case "CU":
    case "VE":
    case "PR":
      return ["en", "es"];
    // French-speaking
    case "FR":
    case "BE":
    case "LU":
    case "MC":
    case "CA":
    case "MA":
    case "TN":
    case "SN":
    case "CI":
      return ["en", "fr"];
    default:
      return ["en"];
  }
}
