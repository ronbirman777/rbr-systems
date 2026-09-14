import { describe, expect, it } from "vitest";
import {
  hexToRgb,
  contrastRatio,
  meetsAA,
  safeTextColor,
  mixHex,
  deriveSoftSurface,
  deriveAccessibleForeground,
  deriveGuaranteedDarkSurface,
} from "./contrast";

const PARCHMENT = "#F5F0E8";

describe("mixHex", () => {
  it("returns the starting color at amount 0", () => {
    expect(mixHex("#000000", "#ffffff", 0)).toBe("#000000");
  });

  it("returns the ending color at amount 1", () => {
    expect(mixHex("#000000", "#ffffff", 1)).toBe("#ffffff");
  });

  it("returns the midpoint at amount 0.5", () => {
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
  });

  it("clamps out-of-range amounts", () => {
    expect(mixHex("#000000", "#ffffff", -1)).toBe("#000000");
    expect(mixHex("#000000", "#ffffff", 2)).toBe("#ffffff");
  });
});

describe("deriveSoftSurface", () => {
  it("stays very close to the background at a low amount", () => {
    const soft = deriveSoftSurface("#8F3B3B", PARCHMENT, 0.14);
    // Should be much closer to the light parchment background than to the
    // saturated brand color - a light tint, not a near-solid block.
    const distToBackground = contrastRatio(hexToRgb(soft), hexToRgb(PARCHMENT));
    expect(distToBackground).toBeLessThan(1.3);
  });
});

/**
 * The exact "difficult choices" the brief calls out - each of these must
 * end up genuinely readable (WCAG AA, >= 4.5:1) against its own derived
 * soft surface, not just "probably fine". Forest/Dusk are dark enough
 * that the organizer's exact color should survive untouched; Clay/Ember
 * (lighter, warmer) are the ones most likely to actually need darkening.
 */
describe("deriveAccessibleForeground - difficult brand colors", () => {
  const cases: Array<[string, string]> = [
    ["Forest", "#2D4A3E"],
    ["Clay", "#C4785A"],
    ["Ocean", "#3B6E8F"],
    ["Dusk", "#5C4A6B"],
    ["Ember", "#8F3B3B"],
  ];

  for (const [label, hex] of cases) {
    it(`${label} (${hex}) produces an AA-legible foreground on its own soft surface`, () => {
      const soft = deriveSoftSurface(hex, PARCHMENT);
      const fg = deriveAccessibleForeground(hex, soft);
      expect(meetsAA(soft, fg)).toBe(true);
    });
  }

  it("preserves an already-dark color exactly (Forest needs no darkening)", () => {
    const soft = deriveSoftSurface("#2D4A3E", PARCHMENT);
    expect(deriveAccessibleForeground("#2D4A3E", soft)).toBe("#2D4A3E");
  });

  it("darkens a very light custom hex until it's legible", () => {
    const veryLight = "#F5E6A8"; // pale yellow
    const soft = deriveSoftSurface(veryLight, PARCHMENT);
    const fg = deriveAccessibleForeground(veryLight, soft);
    expect(meetsAA(soft, fg)).toBe(true);
    // It actually changed - the raw color alone would have failed here.
    expect(fg).not.toBe(veryLight);
  });

  it("leaves a very dark custom hex untouched (trivially passes)", () => {
    const veryDark = "#0A0A0A";
    const soft = deriveSoftSurface(veryDark, PARCHMENT);
    expect(deriveAccessibleForeground(veryDark, soft)).toBe(veryDark);
  });
});

const FOREST = "#2D4A3E";

describe("deriveGuaranteedDarkSurface", () => {
  it("stays legible for fixed white text even when the source color is very light", () => {
    const dark = deriveGuaranteedDarkSurface("#F5E6A8", FOREST);
    expect(meetsAA(dark, "#FFFFFF")).toBe(true);
  });

  it("always applies at least the minimum blend toward the anchor, even for a source that already passes on its own", () => {
    // Ocean already meets AA against white by itself - the function still
    // must not just return it unchanged, or "-dark" would stop reading as
    // a deliberately-darker sibling of the raw color.
    const source = "#3B6E8F";
    expect(meetsAA(source, "#FFFFFF")).toBe(true); // sanity: passes even unmixed
    const result = deriveGuaranteedDarkSurface(source, FOREST, 0.45);
    expect(result).not.toBe(source);
    expect(meetsAA(result, "#FFFFFF")).toBe(true);
  });

  it("falls all the way back to the anchor color in the worst case (pure white source)", () => {
    const dark = deriveGuaranteedDarkSurface("#FFFFFF", FOREST);
    expect(meetsAA(dark, "#FFFFFF")).toBe(true);
  });
});

describe("existing contrast utilities - unchanged behavior", () => {
  it("safeTextColor still picks a readable color against a light background", () => {
    expect(safeTextColor("#FBF9F5")).toBe("#1B2E24");
  });

  it("meetsAA still rejects a genuinely low-contrast pair", () => {
    expect(meetsAA("#FFFFFF", "#F5E6A8")).toBe(false);
  });
});
