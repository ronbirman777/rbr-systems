import type { PartialDictionary } from "./en";

/**
 * Turkish/Italian shared dictionary - PARTIAL by design (TASK 032).
 *
 * Complete here: the Guest attribution. Complete elsewhere: the account-level
 * surfaces (billing and Admin) live in the account dictionaries (see account.ts).
 * Not yet translated: the Teach / Flow / Studio / common namespaces - every missing key falls
 * back to English through translate(), which is exactly what the Guest Apps and
 * Studio already do for any missing key. They are translated in TASK 033, and only then do
 * Turkish and Italian become selectable as a Space language (SPACE_SELECTABLE_LOCALES).
 */
export const tr: PartialDictionary = {
  attribution: {
    // The Guest App signature. "InnerDweS" is a link and is never translated: the brand arrives as {brand}.
    createdWith: "{brand} ile oluşturuldu",
    linkLabel: "{brand} - yeni sekmede açılır",
  },
};
