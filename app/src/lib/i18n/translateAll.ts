import { SUPPORTED_LOCALES, type Locale } from "./locales";
import { translate, type Namespace, type TranslationKey } from "./index";

/**
 * TASK 033: one key in every supported language, for static UI that must
 * pick its language on the client (the Studio route loaders - see
 * components/localized-status-text.tsx). Server-side; strings come from the
 * dictionaries, never duplicated.
 */
export function translateAll<N extends Namespace>(namespace: N, key: TranslationKey<N>): Record<Locale, string> {
  return Object.fromEntries(SUPPORTED_LOCALES.map((l) => [l, translate(l, namespace, key)])) as Record<Locale, string>;
}
