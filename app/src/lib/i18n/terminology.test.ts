import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
 * Every wording below was APPROVED BY THE PRODUCT OWNER (TASK 029, R1-R11).
 * Approval is not native-speaker verification: the strings were reviewed
 * by the owner and by AI, and no professional speaker of German, Spanish
 * or French has signed them off. he.ts still carries its own UNREVIEWED
 * banner for the same reason.
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

  it("names Facilities after rooms, not equipment (R1)", () => {
    // Every one of these used to be contradicted by the module's own
    // description sitting directly underneath it: German said
    // "Einrichtungen" over "die Räume um sie herum", Spanish said
    // "Instalaciones" over "los espacios que les rodean", Hebrew said
    // "מתקנים" - installations, gym apparatus - over "המרחבים סביבם".
    // French was already right and is the register the others moved to.
    expect(translate("de", "flow", "facilities")).toBe("Räume");
    expect(translate("es", "flow", "facilities")).toBe("Espacios");
    expect(translate("fr", "flow", "facilities")).toBe("Lieux");
    expect(translate("he", "flow", "facilities")).toBe("מרחבים ומתקנים");
    // The name and its description must not drift apart again.
    expect(translate("de", "flow", "moduleFacilitiesDesc")).toContain("Räume");
    expect(translate("es", "flow", "moduleFacilitiesDesc")).toContain("espacios");
    expect(translate("he", "flow", "moduleFacilitiesDesc")).toContain("מרחבים");
  });

  it("keeps one German word for a piece of writing across both products (R3)", () => {
    // Flow called it a "Lesestück" and Teach called it a "Text". One
    // product, one word.
    expect(translate("de", "flow", "readings")).toBe("Texte");
    expect(translate("de", "teach", "exploreReadings")).toBe("Meine Texte");
    // And recordings are Aufnahmen, not the colloquial "Audios".
    expect(translate("de", "teach", "exploreAudio")).toBe("Meine Aufnahmen");
  });

  it("distinguishes a class timetable from a retreat programme in German (R5)", () => {
    // The other four locales already made this distinction; German used
    // the generic "Zeitplan" for both.
    expect(translate("de", "teach", "navSchedule")).toBe("Kursplan");
    expect(translate("de", "flow", "navSchedule")).toBe("Zeitplan");
  });

  it("keeps guest navigation labels short enough for a four-up tab bar (R6)", () => {
    // "À propos de moi" was 15 characters against 4-8 for every other
    // label sharing that bar.
    expect(translate("fr", "teach", "navAbout")).toBe("À propos");
    for (const locale of SUPPORTED_LOCALES) {
      for (const key of ["navHome", "navSchedule", "navAbout", "navExplore"] as const) {
        expect(
          translate(locale, "teach", key).length,
          `teach.${key} is too long for the tab bar in ${locale}`
        ).toBeLessThanOrEqual(12);
      }
    }
  });

  it("names the Hebrew Explore tab with a noun, not an imperative (R7)", () => {
    // Hebrew tab bars name things. "גלו" ("discover!") read as a command
    // in a place that is otherwise a list of nouns - and it has to work
    // as a back-destination too: common.backTo gives "חזרה לתכנים".
    expect(translate("he", "teach", "navExplore")).toBe("תכנים");
    expect(translate("he", "common", "backTo", { label: translate("he", "teach", "navExplore") }))
      .toBe("חזרה לתכנים");
  });

  it("says the guests LISTEN to audio rather than broadcast it (R8)", () => {
    // "להשמיע" is to play something so others hear it.
    const he = translate("he", "flow", "moduleAudioDesc");
    expect(he).toContain("להאזין");
    expect(he).not.toContain("להשמיע");
    // French never had the bug - it already said "écouter".
    expect(translate("fr", "flow", "moduleAudioDesc")).toContain("écouter");
  });

  it("uses German's own noun instead of a calque (R9)", () => {
    const de = translate("de", "flow", "moduleGuidelinesDesc");
    expect(de).toContain("Wissenswertes");
    expect(de).not.toContain("Gut-zu-wissen");
  });

  it("keeps the French audio description plural in KIND, not just number (R10)", () => {
    // "enseignements" replaces the dated "causeries", but it sits as ONE
    // of three kinds beside meditations and practices - the module holds
    // conversations and meditations too, and the sentence must not claim
    // everything in it is a teaching.
    const fr = translate("fr", "flow", "moduleAudioDesc");
    expect(fr).toBe("Méditations, enseignements et pratiques que tes invités peuvent écouter.");
    expect(fr).not.toContain("causeries");
  });

  it("calls the Guest App by a Hebrew name, with feminine agreement (R11)", () => {
    // The term was "ה-Guest App" in 15 strings. "אפליקציה" is feminine,
    // and several of those strings agreed with it in the masculine - so
    // this was never a find-and-replace.
    const he = JSON.stringify(dictionaryOf("he"));
    expect(he, "a Latin \"Guest App\" survives in Hebrew").not.toContain("Guest App");
    expect(translate("he", "studio", "guestAppLink")).toBe("קישור לאפליקציית האורחים");
    expect(translate("he", "studio", "openGuestApp")).toBe("פתיחת אפליקציית האורחים");
    expect(translate("he", "flow", "viewLiveGuestApp")).toBe("צפייה באפליקציית האורחים החיה");
    // The five that carried a masculine agreement, now feminine:
    expect(translate("he", "flow", "previewPublishBody")).toContain("החיה מתעדכנת");
    expect(translate("he", "flow", "needCoverImage")).toContain("שאפליקציית האורחים תקבל");
    expect(translate("he", "studio", "contrastPolicy")).toContain("בוחרת");
    expect(translate("he", "teach", "draftPreviewBody")).toContain("האמיתית");
    expect(translate("he", "teach", "shareYourGuestApp")).toBe("שיתוף אפליקציית האורחים");
  });

  it("Spanish warms the house rules and drops the school register (R2, R4)", () => {
    expect(translate("es", "flow", "guidelines")).toBe("Normas de convivencia");
    expect(translate("es", "flow", "moduleFacilitatorsLabel")).toBe("Equipo / profesores");
  });

  it("gives the Explore card a short Guidelines label, and only there", () => {
    // The Explore tile is two-up with an 18px truncating title. Spanish's
    // approved "Normas de convivencia" needs 187px against the 153px it
    // gets at 430, so it ellipsised to "Normas de conviv…" on every common
    // phone. The owner split the surfaces rather than shorten the term:
    // the card says "Normas", everything with room says the full thing.
    expect(translate("es", "flow", "guidelinesShort")).toBe("Normas");
    expect(translate("es", "flow", "guidelines")).toBe("Normas de convivencia");

    // Only Spanish diverges. The short key exists so ONE language can be
    // shorter in ONE place - if these ever stop matching, someone has
    // started a second set of module names by accident.
    for (const locale of ["en", "de", "fr", "he"] as const) {
      expect(
        translate(locale, "flow", "guidelinesShort"),
        `${locale} should not need a separate short Guidelines label`
      ).toBe(translate(locale, "flow", "guidelines"));
    }
  });

  it("wires the short label to the Explore card and the full one everywhere else", () => {
    // A string assertion cannot tell which surface renders which key, so
    // this reads the call sites. The card is the ONLY place the short form
    // is allowed, and the detail screen it opens must keep the full name -
    // tapping "Normas" and landing on a heading that says something else
    // would read as a different page.
    const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

    const explore = read("components/guest/explore-screen.tsx");
    expect(explore).toContain('title={t("flow", "guidelinesShort")}');
    expect(explore).not.toContain('title={t("flow", "guidelines")}');

    const detail = read("components/guest/guidelines-screen.tsx");
    expect(detail).toContain('title={t("flow", "guidelines")}');
    expect(detail).not.toContain("guidelinesShort");

    const step = read("app/(site)/configurator/retreat/guidelines-step.tsx");
    expect(step).toContain('t("flow", "guidelines")');
    expect(step).not.toContain("guidelinesShort");

    // The Studio's step label and Modules card both come from moduleLabel(),
    // which must keep pointing at the full name.
    expect(read("lib/modules/catalog.ts")).toContain('guidelines: "guidelines"');
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

const SRC = join(__dirname, "..", "..");

/** Every string a locale ships, flattened, for whole-dictionary guards. */
function allStrings(locale: string): string {
  return JSON.stringify(dictionaryOf(locale));
}

function dictionaryOf(locale: string): unknown {
  const dictionaries: Record<string, unknown> = { en, de, es, fr, he };
  return dictionaries[locale];
}
