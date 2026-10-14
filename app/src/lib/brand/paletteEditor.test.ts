import { describe, expect, it } from "vitest";
import { CANONICAL_BRAND_PRESETS } from "./presets";
import { customSectionStartsOpen, flowPaletteSelection, nextPresetIndex, stashOnPresetApply, teachPaletteSelection } from "./paletteEditor";

/** TASK 033 Brand editor: backward-compatible selection for every saved shape. */
const sage = CANONICAL_BRAND_PRESETS.find((p) => p.key === "sageLight")!;
const flowOf = (p: typeof sage) => ({ primary: p.primary, accent: p.accent, navigation: p.navigation, text: p.text, surface: p.surface });

describe("flowPaletteSelection (brand_configs custom_* columns)", () => {
  it("an exact preset (any case) is that preset", () => {
    expect(flowPaletteSelection(flowOf(sage))).toEqual({ mode: "preset", selectedKey: "sageLight" });
    const lower = Object.fromEntries(Object.entries(flowOf(sage)).map(([k, v]) => [k, v.toLowerCase()])) as ReturnType<typeof flowOf>;
    expect(flowPaletteSelection(lower).selectedKey).toBe("sageLight");
  });
  it("every canonical preset round-trips", () => {
    for (const p of CANONICAL_BRAND_PRESETS) expect(flowPaletteSelection(flowOf(p)).selectedKey).toBe(p.key);
  });
  it("a preset with one role changed is custom", () => {
    expect(flowPaletteSelection({ ...flowOf(sage), surface: "#FFFFFF" })).toEqual({ mode: "custom", selectedKey: null });
  });
  it("pre-028B Space: preset colours but no surface saved -> custom (strict match), never rewritten", () => {
    expect(flowPaletteSelection({ ...flowOf(sage), surface: null }).mode).toBe("custom");
  });
  it("legacy partial custom (primary only) is custom", () => {
    expect(flowPaletteSelection({ primary: "#2D4A3E", accent: null, navigation: null, text: null, surface: null }).mode).toBe("custom");
  });
  it("nothing saved (legacy palette Space) is the default: nothing selected", () => {
    expect(flowPaletteSelection({ primary: null, accent: null, navigation: null, text: null, surface: null })).toEqual({ mode: "default", selectedKey: null });
    expect(flowPaletteSelection({ primary: "", accent: " ", navigation: null, text: null, surface: null }).mode).toBe("default");
  });
});

describe("teachPaletteSelection (teachStyle.preset)", () => {
  it("a known preset key", () => expect(teachPaletteSelection("dustyRose")).toEqual({ mode: "preset", selectedKey: "dustyRose" }));
  it.each([["custom"], [undefined], [null], ["oldLegacyKey"], [42]])("%s -> custom", (v) => expect(teachPaletteSelection(v).mode).toBe("custom"));
});

describe("custom section + keep-last-custom", () => {
  it("opens only when custom colours are in use", () => {
    expect(customSectionStartsOpen({ mode: "custom", selectedKey: null })).toBe(true);
    expect(customSectionStartsOpen({ mode: "preset", selectedKey: "forest" })).toBe(false);
    expect(customSectionStartsOpen({ mode: "default", selectedKey: null })).toBe(false);
  });
  it("remembers custom colours when leaving custom for a preset, nothing when switching presets", () => {
    const mine = { primary: "#123456" };
    expect(stashOnPresetApply({ mode: "custom", selectedKey: null }, mine, null)).toBe(mine);
    expect(stashOnPresetApply({ mode: "preset", selectedKey: "forest" }, { primary: "#192B21" }, mine)).toBe(mine);
    expect(stashOnPresetApply({ mode: "default", selectedKey: null }, { primary: null }, null)).toBeNull();
  });
});

describe("nextPresetIndex (radio keyboard)", () => {
  it("wraps with arrows, Home/End jump, RTL mirrors left/right", () => {
    expect(nextPresetIndex(0, "ArrowRight", 8)).toBe(1);
    expect(nextPresetIndex(7, "ArrowRight", 8)).toBe(0);
    expect(nextPresetIndex(0, "ArrowLeft", 8)).toBe(7);
    expect(nextPresetIndex(3, "ArrowDown", 8)).toBe(4);
    expect(nextPresetIndex(3, "ArrowUp", 8)).toBe(2);
    expect(nextPresetIndex(3, "Home", 8)).toBe(0);
    expect(nextPresetIndex(3, "End", 9)).toBe(8);
    expect(nextPresetIndex(0, "ArrowLeft", 8, true)).toBe(1);
    expect(nextPresetIndex(0, "Tab", 8)).toBeNull();
  });
});
