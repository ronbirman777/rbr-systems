import { en, type Dictionary, type Namespace, type PartialDictionary } from "./dictionaries/en";
import { DEFAULT_LOCALE, directionOf, resolveLocale, type Direction, type Locale } from "./locales";

export * from "./locales";
export type { Dictionary, Namespace, PartialDictionary };

/**
 * The shared translator (core: English only - see the registry note below).
 *
 * Three properties worth stating, because each is a decision:
 *
 *   TYPED KEYS. `t("teach", "navHome")` is checked against the English
 *   dictionary, so a typo or a key removed from English fails the build
 *   rather than rendering a raw key to a guest.
 *
 *   DETERMINISTIC FALLBACK. A key missing from a non-English locale falls
 *   back to English - never to the key name, never to an empty string. A
 *   partially translated locale degrades to a readable mixed UI instead
 *   of a broken one.
 *
 *   NO RUNTIME TRANSLATION. There is no network call and no machine
 *   translation here, and user-authored content never passes through
 *   this function at all.
 */

/**
 * TASK 033 (QA defect D5) - the dictionary REGISTRY.
 *
 * This module ("@/lib/i18n/core") holds the translator and English only.
 * "@/lib/i18n" (index.ts) re-exports it and registers every other locale,
 * so the server, the Studio and every existing import see exactly the
 * behaviour they always had. The published Guest App's client modules
 * import "@/lib/i18n/core" instead, so a guest's browser no longer
 * downloads all seven dictionaries: the Guest roots (GuestApp,
 * TeachGuestApp, GuestAccessScreen) receive the Space locale's messages
 * from the server (lib/i18n/guestMessages.ts) and register them before
 * their children render - same keys, same strings, same English fallback.
 */
const DICTIONARIES: Partial<Record<Locale, PartialDictionary>> = { en };

/**
 * Makes a locale's (possibly partial) dictionary available to translate().
 * Additive and idempotent: namespaces already registered are kept (so a
 * Guest root's partial messages can never shadow the full dictionary
 * index.ts registered in the same server process), missing ones are added.
 */
export function registerDictionary(locale: Locale, dictionary: PartialDictionary): void {
  if (locale === "en") return; // English is the type and the fallback: never replaced.
  const existing = DICTIONARIES[locale];
  if (existing === dictionary) return;
  DICTIONARIES[locale] = existing ? { ...dictionary, ...existing } : dictionary;
}

/** Whether translate() currently has a dictionary for this locale (English always). */
export function hasDictionary(locale: Locale): boolean {
  return DICTIONARIES[locale] !== undefined;
}

/** The registered dictionary of a locale, if any (index.ts's coverage helpers). */
export function registeredDictionary(locale: Locale): PartialDictionary | undefined {
  return DICTIONARIES[locale];
}

/**
 * A locale's messages as passed from the server to a Guest client root:
 * only the namespaces the Guest App uses (never "studio").
 */
export type LocaleMessages = { locale: Locale; dictionary: PartialDictionary };

/**
 * Registers server-provided messages (see LocaleMessages). Called at the
 * top of a Guest client root's render, before any child translates. A
 * missing value (English Space, or a Studio preview, where index.ts has
 * already registered everything) is a no-op.
 */
export function registerLocaleMessages(messages: LocaleMessages | null | undefined): void {
  if (messages) registerDictionary(messages.locale, messages.dictionary);
}

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
 * Splits a heading whose emphasised word must move with the language.
 *
 * "Your {em}" is "{em} שלך" in Hebrew - the emphasis lands before the
 * rest, not after - so the carrier phrase keeps the placeholder and the
 * caller renders [before, emphasis, after] in whatever order it arrives.
 */
export function splitEmphasis(carrier: string, emphasis: string): [string, string, string] {
  const i = carrier.indexOf("{em}");
  if (i < 0) return [carrier, "", ""];
  return [carrier.slice(0, i), emphasis, carrier.slice(i + 4)];
}

/**
 * The Space locale a Server Action should answer in.
 *
 * Studio forms post it alongside their payload, which keeps the action
 * signatures (and `useActionState`) unchanged. It is read through
 * `resolveLocale`, so an absent, stale or hand-edited value resolves to
 * English rather than failing - and because it only ever selects which
 * message text to return, it carries no authority. Authorization stays
 * entirely with RLS and the action's own checks.
 */
export function localeFromFormData(formData: { get(name: string): unknown }): Locale {
  return resolveLocale(formData.get("locale"));
}

/**
 * A message function bound to one locale, for Server Actions.
 *
 * Studio actions return `{ error }` strings that the Studio renders
 * directly, and they almost all draw on the shared `studio` namespace.
 * Binding the locale once per action keeps each message site short
 * enough to read: `t("missingSpace")` rather than repeating the locale
 * and namespace on every line.
 */
export function studioMessages(locale: Locale) {
  return (key: TranslationKey<"studio">, values?: TranslationValues): string =>
    translate(locale, "studio", key, values);
}
