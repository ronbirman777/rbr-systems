import { en, type Namespace, type PartialDictionary } from "./dictionaries/en";
import { he } from "./dictionaries/he";
import { de } from "./dictionaries/de";
import { es } from "./dictionaries/es";
import { fr } from "./dictionaries/fr";
import { tr } from "./dictionaries/tr";
import { it } from "./dictionaries/it";
import { registerDictionary, registeredDictionary, type Locale } from "./core";

export * from "./core";

/**
 * "@/lib/i18n" - the translator with EVERY locale registered (see the
 * registry note in core.ts). Server code, the Studio and tests import this
 * and get exactly the pre-TASK-033 behaviour. Client modules of the
 * published Guest App import "@/lib/i18n/core" instead (TASK 033, QA defect
 * D5), so these dictionaries stay out of the Guest bundle.
 */
const ALL: Record<Exclude<Locale, "en">, PartialDictionary> = { de, es, fr, he, tr, it };
for (const [locale, dictionary] of Object.entries(ALL) as [Locale, PartialDictionary][]) registerDictionary(locale, dictionary);

/**
 * Keys present in English but missing from a locale. Used by the test
 * suite to report translation coverage honestly instead of letting a
 * silent fallback hide an untranslated surface.
 */
export function missingKeys(locale: Locale): string[] {
  const dictionary = registeredDictionary(locale) ?? {};
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
  const dictionary = registeredDictionary(locale) ?? {};
  const same: string[] = [];
  for (const namespace of Object.keys(en) as Namespace[]) {
    for (const [key, value] of Object.entries(en[namespace])) {
      const localized = (dictionary[namespace] as Record<string, string> | undefined)?.[key];
      if (localized === value) same.push(`${namespace}.${key}`);
    }
  }
  return same;
}
