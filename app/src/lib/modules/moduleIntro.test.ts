import { describe, expect, it } from "vitest";
import {
  MODULE_INTRO_KEYS,
  moduleIntro,
  moduleIntrosAreEmpty,
  moduleIntrosSchema,
  pruneModuleIntros,
} from "./moduleIntro";

/**
 * TASK 029 decision 2 - the generic module intro. The pruning is what
 * keeps `modules.moduleIntros` ABSENT from a published payload rather
 * than present and empty, which is what 0033's byte-equivalence
 * guarantee rests on.
 */

describe("moduleIntro", () => {
  it("reads one module's intro and trims it", () => {
    expect(moduleIntro({ meals: { intro: "  Cooked that morning.  " } }, "meals")).toBe("Cooked that morning.");
  });

  it("is null for a module with no intro, a blank intro, or no record at all", () => {
    expect(moduleIntro({ meals: { intro: null } }, "meals")).toBeNull();
    expect(moduleIntro({ meals: { intro: "   " } }, "meals")).toBeNull();
    expect(moduleIntro({}, "meals")).toBeNull();
    expect(moduleIntro(null, "meals")).toBeNull();
    expect(moduleIntro(undefined, "meals")).toBeNull();
    expect(moduleIntro({ meals: { intro: "x" } }, "facilities")).toBeNull();
  });
});

describe("pruneModuleIntros", () => {
  it("drops every empty entry and trims the rest", () => {
    expect(
      pruneModuleIntros({
        meals: { intro: "  Vegetarian.  " },
        facilities: { intro: "" },
        treatments: { intro: null },
      })
    ).toEqual({ meals: { intro: "Vegetarian." } });
  });

  it("clearing the only intro leaves {} - so publish_space emits no key", () => {
    expect(pruneModuleIntros({ meals: { intro: "" } })).toEqual({});
    expect(moduleIntrosAreEmpty({ meals: { intro: "   " } })).toBe(true);
    expect(moduleIntrosAreEmpty({ meals: { intro: "x" } })).toBe(false);
  });
});

describe("moduleIntrosSchema", () => {
  it("accepts any module key, which is what makes it generic", () => {
    // Adding Facilities later must cost no migration and no schema edit.
    const parsed = moduleIntrosSchema.safeParse({ facilities: { intro: "The grounds are yours." } });
    expect(parsed.success).toBe(true);
  });

  it("defaults a missing intro rather than failing the whole object", () => {
    expect(moduleIntrosSchema.parse({ meals: {} })).toEqual({ meals: { intro: null } });
  });

  it("offers Meals today, and is shaped to offer more without a migration", () => {
    expect([...MODULE_INTRO_KEYS]).toEqual(["meals"]);
  });
});
