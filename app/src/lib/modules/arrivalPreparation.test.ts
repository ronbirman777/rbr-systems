import { describe, expect, it } from "vitest";
import { preparationEditedInArrival, preparationView } from "./arrivalPreparation";
import { retreatWhatToBring } from "./retreatProfile";

/** TASK 033 item 4 Part 1: no-data-loss rules, with a fixture for every shape. */
const p = (whatToBring: string[], whatToExpect: string[] = []) => ({ whatToBring, whatToExpect });
const a = (whatToBring: string | null) => ({ whatToBring });

describe("preparationView", () => {
  it("only legacy: seeded from the old Arrival string", () => {
    expect(preparationView(p([]), a("Mat\n\n Water "))).toEqual({ bring: ["Mat", "Water"], bringSource: "legacy", olderBring: null, expect: [] });
  });
  it("only new: the canonical list", () => {
    expect(preparationView(p(["Mat"], ["Silence"]), a(null))).toEqual({ bring: ["Mat"], bringSource: "canonical", olderBring: null, expect: ["Silence"] });
  });
  it("both equal: one list, no notice", () => {
    expect(preparationView(p(["Mat", "Water"]), a("Mat\nWater")).olderBring).toBeNull();
  });
  it("both different: canonical in the editor, the older list shown too (nothing dropped)", () => {
    const v = preparationView(p(["Mat"]), a("Blanket\nTowel"));
    expect(v.bring).toEqual(["Mat"]);
    expect(v.bringSource).toBe("canonical");
    expect(v.olderBring).toEqual(["Blanket", "Towel"]);
  });
  it("empty: nothing", () => {
    expect(preparationView(p([]), a("  \n "))).toEqual({ bring: [], bringSource: "none", olderBring: null, expect: [] });
    expect(preparationView(null, null)).toEqual({ bring: [], bringSource: "none", olderBring: null, expect: [] });
  });
  it("guests see exactly what the editor calls canonical/seeded (one source of truth)", () => {
    for (const [prof, arr] of [[p([]), a("Mat")], [p(["Mat"]), a("Towel")], [p([]), a(null)]] as const) {
      expect(retreatWhatToBring(prof, arr)).toEqual(preparationView(prof, arr).bring);
    }
  });
});

describe("preparationEditedInArrival", () => {
  it("Arrival Info when that module is enabled, else Retreat Home", () => {
    expect(preparationEditedInArrival(new Set(["schedule", "arrivalInfo"]))).toBe(true);
    expect(preparationEditedInArrival(["schedule"])).toBe(false);
  });
});
