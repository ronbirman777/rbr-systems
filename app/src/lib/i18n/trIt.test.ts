import { describe, expect, it } from "vitest";
import {
  SPACE_SELECTABLE_LOCALES,
  SUPPORTED_LOCALES,
  missingKeys,
  recommendedLocales,
  translate,
  untranslatedKeys,
} from "./index";
import { en } from "./dictionaries/en";
import { tr } from "./dictionaries/tr";
import { it as itDictionary } from "./dictionaries/it";
import { capitalizeFirst, formatDateRangeLocalized, formatTimeLocalized, ordinalDayLocalized } from "./datetime";
import { recurrenceSummary } from "@/lib/teach/recurrenceText";

/**
 * Turkish and Italian (TASK 033, package P5).
 *
 * Both are now complete for every shared namespace but remain NOT
 * Space-selectable until QA and native-speaker review pass (owner decision
 * A2). These tests pin both halves of that: the dictionaries are complete
 * and structurally safe, and the release switch has not been thrown.
 */

const TR_IT = { tr, it: itDictionary } as const;
const placeholders = (s: string) => (s.match(/\{\{?\w+\}?\}/g) ?? []).slice().sort().join("|");

describe("Turkish and Italian are complete for every shared namespace", () => {
  it("every supported locale has every English key, none empty", () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(missingKeys(locale), locale).toEqual([]);
    }
  });

  it("translates the four Space-facing namespaces key for key", () => {
    for (const [locale, dictionary] of Object.entries(TR_IT)) {
      for (const namespace of ["common", "teach", "flow", "studio"] as const) {
        expect(Object.keys(dictionary[namespace]).sort(), `${locale}.${namespace}`).toEqual(
          Object.keys(en[namespace]).sort()
        );
      }
    }
  });

  it("keeps the same placeholder set as English for every key", () => {
    const mismatches: string[] = [];
    for (const [locale, dictionary] of Object.entries(TR_IT)) {
      for (const [namespace, strings] of Object.entries(en)) {
        for (const [key, value] of Object.entries(strings)) {
          const got = (dictionary as Record<string, Record<string, string>>)[namespace][key];
          if (placeholders(got) !== placeholders(value as string)) {
            mismatches.push(`${locale} ${namespace}.${key}: ${placeholders(value as string)} vs ${placeholders(got)}`);
          }
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("has no empty or whitespace-only strings", () => {
    for (const [locale, dictionary] of Object.entries(TR_IT)) {
      for (const [namespace, strings] of Object.entries(dictionary)) {
        for (const [key, value] of Object.entries(strings as Record<string, string>)) {
          expect(value.trim(), `${locale} ${namespace}.${key}`).not.toBe("");
        }
      }
    }
  });

  it("keeps line breaks where English has them", () => {
    for (const [locale, dictionary] of Object.entries(TR_IT)) {
      for (const [namespace, strings] of Object.entries(en)) {
        for (const [key, value] of Object.entries(strings)) {
          const got = (dictionary as Record<string, Record<string, string>>)[namespace][key];
          expect(got.includes("\n"), `${locale} ${namespace}.${key}`).toBe((value as string).includes("\n"));
        }
      }
    }
  });

  it("only repeats English where the word is genuinely the same", () => {
    const allowed: Record<"tr" | "it", Set<string>> = {
      tr: new Set(TR_IDENTICAL),
      it: new Set(IT_IDENTICAL),
    };
    for (const locale of ["tr", "it"] as const) {
      const unexpected = untranslatedKeys(locale).filter((k) => !allowed[locale].has(k));
      expect(unexpected, `${locale} untranslated`).toEqual([]);
    }
  });
});

describe("the release switch for Turkish and Italian is still off", () => {
  it("does not offer tr or it as a Space language yet", () => {
    expect(SPACE_SELECTABLE_LOCALES).not.toContain("tr");
    expect(SPACE_SELECTABLE_LOCALES).not.toContain("it");
  });
});

describe("Turkish and Italian dates", () => {
  it("writes the day of the month the way each language does", () => {
    expect(ordinalDayLocalized(5, "tr")).toBe("5.");
    expect(ordinalDayLocalized(21, "tr")).toBe("21.");
    expect(ordinalDayLocalized(5, "it")).toBe("5");
    expect(ordinalDayLocalized(1, "it")).toBe("1");
    // Unchanged for the existing locales.
    expect(ordinalDayLocalized(5, "de")).toBe("5.");
    expect(ordinalDayLocalized(5, "he")).toBe("5");
    expect(ordinalDayLocalized(1, "en")).toBe("1st");
  });

  it("capitalizes with the locale's own case mapping (Turkish dotted İ)", () => {
    expect(capitalizeFirst("istanbul", "tr")).toBe("İstanbul");
    expect(capitalizeFirst("ılık", "tr")).toBe("Ilık");
    expect(capitalizeFirst("istanbul", "en")).toBe("Istanbul");
    expect(capitalizeFirst("ogni settimana", "it")).toBe("Ogni settimana");
    expect(capitalizeFirst("", "tr")).toBe("");
    expect(capitalizeFirst("every week")).toBe("Every week");
  });

  it("assembles a recurrence summary in Turkish and Italian", () => {
    const weekly = { freq: "weekly", interval: 1, byWeekday: [1, 3], end: { type: "never" } } as const;
    const tr = recurrenceSummary(weekly as never, "2026-10-12", { locale: "tr" });
    expect(tr.startsWith("Her hafta")).toBe(true);
    expect(tr).toContain("Pzt");
    const it = recurrenceSummary(weekly as never, "2026-10-12", { locale: "it" });
    expect(it.startsWith("Ogni settimana")).toBe(true);
    expect(it).toContain("lun");

    const monthly = { freq: "monthly", interval: 1, end: { type: "never" } } as const;
    expect(recurrenceSummary(monthly as never, "2026-10-05", { locale: "tr", withEnd: false })).toContain("5.");
    expect(recurrenceSummary(monthly as never, "2026-10-05", { locale: "it", withEnd: false })).toContain("5");
  });

  it("formats times and ranges through Intl with the tr-TR / it-IT tags", () => {
    expect(formatTimeLocalized("09:05", "tr")).toBe("09:05");
    expect(formatTimeLocalized("21:30", "it")).toBe("21:30");
    expect(formatDateRangeLocalized("2026-10-14", "2026-10-20", "tr")).toMatch(/14.20 Eki 2026/);
    expect(formatDateRangeLocalized("2026-10-14", "2026-10-20", "it")).toMatch(/14.20 ott 2026/);
  });
});

describe("country recommendations include Turkish and Italian", () => {
  it("recommends Turkish for Turkey and Italian for Italy, San Marino and Vatican City", () => {
    expect(recommendedLocales("TR")).toEqual(["en", "tr"]);
    expect(recommendedLocales("tr")).toEqual(["en", "tr"]);
    for (const country of ["IT", "SM", "VA"]) {
      expect(recommendedLocales(country), country).toEqual(["en", "it"]);
    }
    // Italian-speaking Switzerland stays German-recommended: CH is one code.
    expect(recommendedLocales("CH")).toEqual(["en", "de"]);
  });
});

describe("Turkish and Italian translate the Space-facing surfaces", () => {
  it("translates the Studio's audio-allowance messages rather than falling back", () => {
    for (const locale of ["tr", "it"] as const) {
      const text = translate(locale, "studio", "audioRecordingTooLong", { max: 60 });
      expect(text).not.toBe(translate("en", "studio", "audioRecordingTooLong", { max: 60 }));
      expect(text).toContain("60");
    }
  });
});

/** Keys whose Turkish value is legitimately byte-identical to English. */
const TR_IDENTICAL: string[] = [
  // Words Turkish writes exactly as English does.
  "teach.typoModern",
  "teach.cornersMinimal",
  "flow.mealBrunch",
  // Practice names used as-is in Turkish yoga studios.
  "teach.catYogaNidra",
  "teach.catMantra",
  "flow.catYoga",
  // Proper nouns, sample values and format names.
  "teach.myNamePlaceholder",
  "teach.maya",
  "teach.issuerPlaceholder",
  "flow.whatsapp",
  "flow.readabilitySample",
  "flow.addressPlaceholder",
  "studio.imageFormats",
];

/** Keys whose Italian value is legitimately byte-identical to English. */
const IT_IDENTICAL: string[] = [
  // Established Italian interface and hospitality vocabulary.
  "teach.navHome",
  "teach.sectionHome",
  "teach.sectionBrand",
  "studio.navBrand",
  "flow.navTeam",
  "flow.checkIn",
  "flow.checkOut",
  "flow.mealBrunch",
  "flow.moduleAudio",
  "flow.audioStepTitle",
  // "Max" and "min" are the Italian abbreviations too.
  "teach.maxParticipants",
  "teach.minutes",
  // Practice names, and a colour name that is Italian to begin with.
  "teach.catMantra",
  "flow.catYoga",
  "flow.specialtiesPlaceholder",
  "studio.presetTerracotta",
  // Proper nouns, sample values and format names.
  "teach.myNamePlaceholder",
  "teach.maya",
  "teach.issuerPlaceholder",
  "flow.whatsapp",
  "flow.readabilitySample",
  "flow.addressPlaceholder",
  "studio.imageFormats",
];
