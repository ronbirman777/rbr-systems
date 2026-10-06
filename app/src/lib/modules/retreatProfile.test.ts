import { describe, expect, it } from "vitest";
import {
  EMPTY_RETREAT_PROFILE,
  listToText,
  normalizeLegacyList,
  retreatProfileIsEmpty,
  retreatProfileSchema,
  retreatWelcome,
  retreatWhatToBring,
  textToList,
} from "./retreatProfile";

/**
 * TASK 029 decision A - the read precedence and the legacy
 * normalization, which are the only places the two generations of this
 * content meet.
 */

describe("normalizeLegacyList", () => {
  it("splits on newlines, trims, and drops empty lines", () => {
    expect(normalizeLegacyList("Towel\nWater bottle\n\n  Shoes  \n")).toEqual(["Towel", "Water bottle", "Shoes"]);
  });

  it("handles Windows line endings", () => {
    expect(normalizeLegacyList("Towel\r\nShoes")).toEqual(["Towel", "Shoes"]);
  });

  it("NEVER splits on commas - that is prose, not a list", () => {
    // The decision is explicit about this: an organizer who wrote
    // "Loose clothing, a towel and a water bottle" wrote one sentence,
    // and cutting it into three bullets rewrites their voice.
    expect(normalizeLegacyList("Loose clothing, a towel and a water bottle")).toEqual([
      "Loose clothing, a towel and a water bottle",
    ]);
  });

  it("NEVER splits on sentence boundaries", () => {
    // "Bring layers. Evenings are cold." would become two bullets, and
    // the second one is not a thing to bring at all.
    expect(normalizeLegacyList("Bring layers. Evenings are cold.")).toEqual(["Bring layers. Evenings are cold."]);
  });

  it("returns a one-item array for a single line", () => {
    expect(normalizeLegacyList("Just a towel")).toEqual(["Just a towel"]);
  });

  it("returns nothing for nothing", () => {
    expect(normalizeLegacyList(null)).toEqual([]);
    expect(normalizeLegacyList(undefined)).toEqual([]);
    expect(normalizeLegacyList("")).toEqual([]);
    expect(normalizeLegacyList("   \n  \n ")).toEqual([]);
  });
});

describe("retreatWhatToBring precedence", () => {
  const legacy = (whatToBring: string | null) => ({ whatToBring });

  it("1. the canonical list wins when it has anything in it", () => {
    expect(
      retreatWhatToBring({ whatToBring: ["Layers", "Journal"] }, legacy("Towel\nShoes"))
    ).toEqual(["Layers", "Journal"]);
  });

  it("2. the legacy string is used when the canonical list is empty", () => {
    expect(retreatWhatToBring({ whatToBring: [] }, legacy("Towel\nShoes"))).toEqual(["Towel", "Shoes"]);
  });

  it("3. nothing, when neither has anything", () => {
    expect(retreatWhatToBring({ whatToBring: [] }, legacy(null))).toEqual([]);
    expect(retreatWhatToBring(null, null)).toEqual([]);
    expect(retreatWhatToBring(undefined, undefined)).toEqual([]);
  });

  it("an EMPTY canonical list is not an override", () => {
    // A Space that has a legacy value and has never opened Retreat Home
    // has `whatToBring: []`, and its guests must still see the legacy
    // content - otherwise shipping this task would blank a published
    // Space's packing list.
    expect(retreatWhatToBring(EMPTY_RETREAT_PROFILE, legacy("Towel"))).toEqual(["Towel"]);
  });

  it("reads a profile that has no legacy row at all", () => {
    expect(retreatWhatToBring({ whatToBring: ["Layers"] }, null)).toEqual(["Layers"]);
  });
});

describe("retreatWelcome precedence", () => {
  const legacy = (welcomeMessage: string | null) => ({ welcomeMessage });

  it("prefers the canonical welcome, then the legacy one, then nothing", () => {
    expect(retreatWelcome({ welcome: "Canonical" }, legacy("Legacy"))).toBe("Canonical");
    expect(retreatWelcome({ welcome: null }, legacy("Legacy"))).toBe("Legacy");
    expect(retreatWelcome({ welcome: null }, legacy(null))).toBeNull();
    expect(retreatWelcome(null, null)).toBeNull();
  });

  it("treats whitespace as absent on both sides", () => {
    expect(retreatWelcome({ welcome: "   " }, legacy("Legacy"))).toBe("Legacy");
    expect(retreatWelcome({ welcome: null }, legacy("  \n "))).toBeNull();
  });

  it("trims what it returns", () => {
    expect(retreatWelcome({ welcome: "  Hello  " }, null)).toBe("Hello");
  });
});

describe("the editor's text <-> list conversion", () => {
  it("round-trips a list through the textarea", () => {
    const items = ["Layers", "A journal", "Shoes you can walk in"];
    expect(textToList(listToText(items))).toEqual(items);
  });

  it("drops the blank lines a person leaves while typing", () => {
    expect(textToList("Layers\n\n\nJournal\n")).toEqual(["Layers", "Journal"]);
  });

  it("turns an emptied textarea into an empty list, not a one-item blank", () => {
    expect(textToList("")).toEqual([]);
    expect(textToList("\n\n")).toEqual([]);
  });
});

describe("retreatProfileSchema", () => {
  it("accepts an absent object and defaults every field", () => {
    expect(retreatProfileSchema.parse({})).toEqual(EMPTY_RETREAT_PROFILE);
  });

  it("keeps organizer text byte-for-byte, including newlines", () => {
    const longDescription = "Line one.\n\nLine three, with  double  spaces.";
    expect(retreatProfileSchema.parse({ longDescription }).longDescription).toBe(longDescription);
  });

  it("knows when nothing has been filled in", () => {
    expect(retreatProfileIsEmpty(EMPTY_RETREAT_PROFILE)).toBe(true);
    expect(retreatProfileIsEmpty({ ...EMPTY_RETREAT_PROFILE, tagline: "x" })).toBe(false);
    expect(retreatProfileIsEmpty({ ...EMPTY_RETREAT_PROFILE, whatToExpect: ["x"] })).toBe(false);
  });

  it("rejects a blank list entry rather than publishing an empty bullet", () => {
    expect(retreatProfileSchema.safeParse({ whatToBring: [""] }).success).toBe(false);
  });
});
