import { en, type Dictionary, type Namespace } from "./dictionaries/en";
import { he } from "./dictionaries/he";
import { de } from "./dictionaries/de";
import { DEFAULT_LOCALE, directionOf, resolveLocale, type Direction, type Locale } from "./locales";

export * from "./locales";
export type { Dictionary, Namespace };

/**
 * The shared translator.
 *
 * Three properties worth stating, because each is a decision:
 *
 *   TYPED KEYS. `t("teach", "navHome")` is checked against the English
 *   dictionary, so a typo or a key removed from English fails the build
 *   rather than rendering a raw key to a guest.
 *
 *   DETERMINISTIC FALLBACK. A key missing from Hebrew or German falls
 *   back to English - never to the key name, never to an empty string. A
 *   partially translated locale degrades to a readable mixed UI instead
 *   of a broken one.
 *
 *   NO RUNTIME TRANSLATION. There is no network call and no machine
 *   translation here, and user-authored content never passes through
 *   this function at all.
 */

const DICTIONARIES: Record<Locale, Dictionary> = { en, he, de };

export type TranslationKey<N extends Namespace> = keyof Dictionary[N];

/** Values interpolated into a string's {placeholders}. */
export type TranslationValues = Record<string, string | number>;

function interpolate(template: string, values?: TranslationValues): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match
  );
}

export function translate<N extends Namespace>(
  locale: Locale,
  namespace: N,
  key: TranslationKey<N>,
  values?: TranslationValues
): string {
  const dictionary = DICTIONARIES[locale] ?? en;
  const localized = dictionary[namespace]?.[key] as string | undefined;
  // Explicitly fall back through English rather than rendering the key.
  const source = localized ?? (en[namespace][key] as unknown as string);
  return interpolate(source, values);
}

export type Translator = {
  locale: Locale;
  dir: Direction;
  t: <N extends Namespace>(namespace: N, key: TranslationKey<N>, values?: TranslationValues) => string;
};

/**
 * A bound translator for one locale. Passed down explicitly rather than
 * read from a global, so a Studio preview can render a Space in its own
 * language while the surrounding Studio stays in another.
 */
export function createTranslator(locale: unknown): Translator {
  const resolved = resolveLocale(locale);
  return {
    locale: resolved,
    dir: directionOf(resolved),
    t: (namespace, key, values) => translate(resolved, namespace, key, values),
  };
}

export const defaultTranslator = createTranslator(DEFAULT_LOCALE);

/**
 * Keys present in English but missing from a locale. Used by the test
 * suite to report translation coverage honestly instead of letting a
 * silent fallback hide an untranslated surface.
 */
export function missingKeys(locale: Locale): string[] {
  const dictionary = DICTIONARIES[locale];
  const missing: string[] = [];
  for (const namespace of Object.keys(en) as Namespace[]) {
    for (const key of Object.keys(en[namespace])) {
      const value = (dictionary[namespace] as Record<string, string> | undefined)?.[key];
      if (value === undefined || value === "") missing.push(`${namespace}.${key}`);
    }
  }
  return missing;
}

/**
 * Keys whose translation is byte-identical to English. Legitimate for a
 * few proper nouns ("WhatsApp", "Team"), suspicious everywhere else, so
 * the suite asserts against a known allowlist rather than a count.
 */
export function untranslatedKeys(locale: Locale): string[] {
  const dictionary = DICTIONARIES[locale];
  const same: string[] = [];
  for (const namespace of Object.keys(en) as Namespace[]) {
    for (const [key, value] of Object.entries(en[namespace])) {
      const localized = (dictionary[namespace] as Record<string, string>)[key];
      if (localized === value) same.push(`${namespace}.${key}`);
    }
  }
  return same;
}
