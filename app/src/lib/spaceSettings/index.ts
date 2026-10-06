import { z } from "zod";
import { isSupportedCountry } from "@/lib/countries";

import { resolveLocale, type Locale } from "@/lib/i18n";
/**
 * Space Settings - the product-neutral home for Space-level preferences
 * that are not specific to Flow, Teach or Heal.
 *
 * It exists because country and locale are the same concept in every
 * product, and the alternative (hiding them inside `teachProfile` and
 * some Flow equivalent) would fork one concept into two and make CP3's
 * locale work product-specific for no reason.
 *
 * Storage: `module_settings` with `module_key = 'spaceSettings'`, the
 * same table and RLS every other Space settings object already uses. No
 * new table, no new access rules.
 *
 * Publication: `module_settings` rows reach guests only through an
 * explicit key list inside publish_space / build_teach_payload, so this
 * key does NOT appear in a published snapshot until that function is
 * changed. That change is migration 0031 and is gated - until it is
 * approved and applied, this is a Studio-side setting and Guest output
 * is byte-identical to today.
 *
 * Every field is nullable with a null default so an existing Space that
 * has no row at all parses to "nothing configured" rather than failing,
 * and so adding the row later needs no backfill.
 */

export const SPACE_SETTINGS_KEY = "spaceSettings" as const;

/** ISO 3166-1 alpha-2, validated against the shared dataset. */
const countryCode = z
  .string()
  .trim()
  .toUpperCase()
  .refine(isSupportedCountry, { message: "Unknown country code" });

/**
 * BCP-47 language subtag. CP3 owns the supported set (en/he/de); the
 * shape is reserved here so locale lands in this object rather than in a
 * second place later. Unknown values fall back to null on read instead of
 * throwing, so a value written by a newer build never breaks an older one.
 */
const localeCode = z.enum(["en", "he", "de"]);

export const spaceSettingsSchema = z.object({
  /**
   * Where the Space operates. Suggests a phone country and, in CP3, a
   * locale. Never a lock: it does not rewrite phone numbers and does not
   * override an explicit locale choice.
   */
  country: countryCode.nullable().catch(null).default(null),
  /** Per-Space UI language. Populated in CP3; reserved and parsed now. */
  locale: localeCode.nullable().catch(null).default(null),
});

export type SpaceSettings = z.infer<typeof spaceSettingsSchema>;

export function defaultSpaceSettings(): SpaceSettings {
  return { country: null, locale: null };
}

/**
 * Tolerant read. A missing row, an empty object, a value from a future
 * build or outright corrupt JSON all resolve to defaults rather than
 * throwing, because this is read on the Studio's critical path and a bad
 * stored value must never make a Space unopenable.
 */
export function parseSpaceSettings(data: unknown): SpaceSettings {
  const parsed = spaceSettingsSchema.safeParse(data ?? {});
  return parsed.success ? parsed.data : defaultSpaceSettings();
}

/**
 * The system language of a PUBLISHED Space, read from the snapshot's
 * `modules.spaceSettings` (migration 0031).
 *
 * Read only from the published payload - never from a private draft and
 * never from the visitor's device, so a guest sees the Space in the
 * language its organizer chose. A Space published before 0031 has no
 * spaceSettings key at all and resolves to English, which is exactly how
 * it renders today.
 */
export function localeFromPublishedModules(modules: unknown): Locale {
  const m = (modules ?? {}) as { spaceSettings?: unknown };
  return resolveLocale(parseSpaceSettings(m.spaceSettings).locale);
}
