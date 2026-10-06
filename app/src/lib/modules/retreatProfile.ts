import { z } from "zod";

/**
 * "retreatProfile" module_key - who this retreat IS, said once.
 *
 * A singleton in module_settings, like arrivalInfo and stayConnected,
 * published whole by publish_space() (0033) only when the row holds
 * something. Before this existed an organizer had no place for the
 * retreat's own description, so a complete retreat meant abusing Custom
 * Pages for the About text and the packing list.
 *
 * Every field is optional and every one hides when empty. That is not
 * laziness about validation: a half-filled profile is the normal state
 * of a Space being built, and a Home screen that renders empty headings
 * is worse than one that renders fewer sections.
 *
 * WHAT IS CANONICAL HERE, AND WHAT IS LEGACY
 *
 * `whatToBring` and `welcome` existed before, inside arrivalInfo, and
 * some Spaces have filled them in. Those stay exactly where they are -
 * nothing is migrated, rewritten or deleted (TASK 029, D3). This file
 * owns the CANONICAL copy, and `retreatWhatToBring()` /
 * `retreatWelcome()` below own the precedence between the two. The
 * Studio never shows two editable fields for one piece of content; see
 * the Home step, which seeds the canonical editor from the legacy value
 * and leaves the legacy row untouched until the organizer saves.
 */
export const retreatProfileSchema = z.object({
  /** One line under the retreat's name on Home. */
  tagline: z.string().nullable().default(null),
  /** The two-sentence version, near the top of Home. */
  shortDescription: z.string().nullable().default(null),
  /** The full "About the Retreat" text. */
  longDescription: z.string().nullable().default(null),
  /** A word to the guest from the host. */
  welcome: z.string().nullable().default(null),
  /** A list, one item per line in the editor. */
  whatToBring: z.array(z.string().min(1)).default([]),
  whatToExpect: z.array(z.string().min(1)).default([]),
});

export type RetreatProfile = z.infer<typeof retreatProfileSchema>;

export const RETREAT_PROFILE_KEY = "retreatProfile";

export const EMPTY_RETREAT_PROFILE: RetreatProfile = {
  tagline: null,
  shortDescription: null,
  longDescription: null,
  welcome: null,
  whatToBring: [],
  whatToExpect: [],
};

/** Whether anything at all has been filled in - the publish and
 * hide-when-empty rule in one place. */
export function retreatProfileIsEmpty(profile: RetreatProfile): boolean {
  return (
    !profile.tagline &&
    !profile.shortDescription &&
    !profile.longDescription &&
    !profile.welcome &&
    profile.whatToBring.length === 0 &&
    profile.whatToExpect.length === 0
  );
}

/**
 * The legacy single-string "what to bring" read as a list.
 *
 * SPLIT ON NEWLINES ONLY (TASK 029, decision A). Organizers typed that
 * field as a free paragraph OR as a typed-out list, and the two are
 * indistinguishable except by line breaks. So: a line break starts a new
 * item, and nothing else does.
 *
 * Specifically NOT split on commas, and not on sentence boundaries.
 * "Loose clothing, a towel and a water bottle" is one line an organizer
 * wrote as prose; turning it into three bullets would rewrite their
 * voice, and "Bring layers. Evenings are cold." would become two bullets
 * where the second is not a thing to bring at all.
 *
 * READ-SIDE ONLY. The stored legacy string is never rewritten - this
 * function does not persist anything, and `retreatWhatToBring()` is the
 * only caller that matters.
 */
export function normalizeLegacyList(legacy: string | null | undefined): string[] {
  if (!legacy) return [];
  return legacy
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * What to Bring, from whichever source has it (TASK 029, decision A):
 *
 *   1. retreatProfile.whatToBring   the canonical list
 *   2. arrivalInfo.whatToBring      the legacy string, split on newlines
 *   3. []                           nothing to show, so show nothing
 *
 * An EMPTY canonical list is not an override: a Space that has a legacy
 * value and has never opened the Home step has `whatToBring: []` in its
 * profile, and must still show the legacy content. Only a non-empty
 * canonical list wins. (The organizer who genuinely wants the list gone
 * clears the legacy field, which the Arrival step points them to.)
 */
export function retreatWhatToBring(
  profile: Pick<RetreatProfile, "whatToBring"> | null | undefined,
  legacy: { whatToBring: string | null } | null | undefined
): string[] {
  const canonical = profile?.whatToBring ?? [];
  if (canonical.length > 0) return canonical;
  return normalizeLegacyList(legacy?.whatToBring);
}

/**
 * The welcome message, same precedence and the same reasoning:
 * canonical `retreatProfile.welcome`, then legacy
 * `arrivalInfo.welcomeMessage`, then nothing. Both are a single string,
 * so no normalization is needed here.
 */
export function retreatWelcome(
  profile: Pick<RetreatProfile, "welcome"> | null | undefined,
  legacy: { welcomeMessage: string | null } | null | undefined
): string | null {
  const canonical = profile?.welcome?.trim();
  if (canonical) return canonical;
  const fallback = legacy?.welcomeMessage?.trim();
  return fallback ? fallback : null;
}

/** The editor's textarea <-> the stored list. One item per line. */
export function listToText(items: string[]): string {
  return items.join("\n");
}

export function textToList(text: string): string[] {
  return normalizeLegacyList(text);
}
