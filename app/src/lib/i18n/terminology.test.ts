import { describe, expect, it } from "vitest";
import { translate } from ".";
import { SUPPORTED_LOCALES } from "./locales";
import { en } from "./dictionaries/en";
import { de } from "./dictionaries/de";
import { es } from "./dictionaries/es";
import { fr } from "./dictionaries/fr";
import { he } from "./dictionaries/he";

/**
 * Terminology decisions, pinned.
 *
 * These are the module names where a literal translation was wrong and a
 * specific wording was chosen instead. They are pinned because the reason
 * for each lives in a review, not in the string - and a later "tidy-up"
 * that reverts one would look like an improvement.
 *
 * See docs/tasks/029/terminology-glossary.md for the full five-locale
 * table and the recommendations still waiting on the product owner.
 *
 * EVERY JUDGEMENT HERE IS AI-REVIEWED, NOT NATIVE-SPEAKER VERIFIED,
 * except where the owner has ruled - which is true of the Hebrew
 * "קטעי הקריאה שלי" benchmark below and nothing else in this file.
 */
describe("terminology decisions", () => {
  it("Hebrew names a COLLECTION of readings, not the act of reading", () => {
    // The owner's own correction, in Teach: "הקריאות שלי" reads as "my
    // readings" in the sense of recitals/readouts, so it became
    // "קטעי הקריאה שלי" - "my reading pieces". Flow's module name had the
    // same defect in its own way: a bare "קריאה" is the activity, not the
    // collection a module lists.
    expect(translate("he", "teach", "exploreReadings")).toBe("קטעי הקריאה שלי");
    expect(translate("he", "teach", "myReadings")).toBe("קטעי הקריאה שלי");
    expect(translate("he", "teach", "exploreAudio")).toBe("קטעי האודיו שלי");
    expect(translate("he", "flow", "readings")).toBe("קטעי קריאה");
    // Flow's is NOT possessive: a retreat's readings belong to the
    // retreat, not to the organizer reading them. Teach's are a
    // teacher's own, which is why only Teach says "שלי".
    expect(translate("he", "flow", "readings")).not.toContain("שלי");
  });

  it("Spanish keeps collection module names plural", () => {
    // "Mi audio" sat next to "Mis lecturas" in the same Explore list and
    // named the same kind of thing - a library of tracks - in the
    // singular. Spanish does not do that.
    expect(translate("es", "teach", "exploreAudio")).toBe("Mis audios");
    expect(translate("es", "teach", "exploreReadings")).toBe("Mis lecturas");
  });

  it("keeps the informal product voice in every language that marks it", () => {
    // A regression guard for the whole dictionary, not one string: the
    // product addresses one person informally, so the formal registers
    // must not reappear anywhere.
    const formal: Record<string, RegExp> = {
      es: /\busted(es)?\b/i,
      fr: /\b(vous|votre|vos|veuillez)\b/i,
    };
    for (const locale of SUPPORTED_LOCALES) {
      const pattern = formal[locale];
      if (!pattern) continue;
      expect(allStrings(locale), `${locale} uses a formal address`).not.toMatch(pattern);
    }
  });
});

/** Every string a locale ships, flattened, for whole-dictionary guards. */
function allStrings(locale: string): string {
  const dictionaries: Record<string, unknown> = { en, de, es, fr, he };
  return JSON.stringify(dictionaries[locale]);
}
