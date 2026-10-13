import { SUPPORTED_LOCALES, registeredDictionary, type Locale, type LocaleMessages, type Namespace } from "./index";

/**
 * TASK 033 (QA defect D5) - the messages a published Guest App's client
 * code needs, resolved on the server (which always has every locale - this
 * module imports "@/lib/i18n") and passed to the Guest client roots as a
 * prop, so the browser receives ONE locale's strings instead of all seven
 * dictionaries in the JavaScript bundle.
 *
 * Namespaces: everything a Guest client module translates. "studio" is the
 * only one left out; guestMessages.test.ts proves no module in the Guest
 * client graph uses it. English needs nothing (it is in core).
 */
export const GUEST_NAMESPACES = ["common", "teach", "flow", "attribution"] as const satisfies readonly Namespace[];

export function guestMessages(locale: Locale): LocaleMessages | null {
  if (locale === "en" || !(SUPPORTED_LOCALES as readonly string[]).includes(locale)) return null;
  const full = registeredDictionary(locale);
  if (!full) return null;
  const dictionary: LocaleMessages["dictionary"] = {};
  for (const ns of GUEST_NAMESPACES) if (full[ns]) (dictionary as Record<string, unknown>)[ns] = full[ns];
  return { locale, dictionary };
}
