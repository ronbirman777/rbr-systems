import { describe, expect, it } from "vitest";
import { findBrandPreset, getBrandPresets, matchBrandPreset, presetColorUpdate } from "./presets";
import { IMAGE_SHAPES, imageShapeAspect, imageShapeRadius, isImageShape, shapeFromAtmosphereTreatment } from "./imageShape";
import { TEACH_PRESETS } from "@/lib/teach/style";

const HEX = /^#[0-9a-fA-F]{6}$/;

describe("shared brand presets", () => {
  it("serves presets for every supported product with valid hex roles and unique keys", () => {
    for (const product of ["retreat", "teach", "client_hub"] as const) {
      const presets = getBrandPresets(product);
      expect(presets.length).toBeGreaterThan(0);
      expect(new Set(presets.map((p) => p.key)).size).toBe(presets.length);
      for (const p of presets) {
        expect(p.primary).toMatch(HEX);
        expect(p.accent).toMatch(HEX);
      }
    }
  });
  it("derives Teach presets from the existing Teach style presets (no second source)", () => {
    expect(getBrandPresets("teach").map((p) => p.key)).toEqual(TEACH_PRESETS.map((p) => p.key));
  });
  it("finds and matches presets by key and by current colours", () => {
    const forest = findBrandPreset("retreat", "forest");
    expect(forest).not.toBeNull();
    expect(matchBrandPreset("retreat", { primary: forest!.primary.toLowerCase(), accent: forest!.accent })?.key).toBe("forest");
    expect(matchBrandPreset("retreat", { primary: "#000000", accent: "#ffffff" })).toBeNull();
    expect(matchBrandPreset("retreat", { primary: null, accent: null })).toBeNull();
    expect(findBrandPreset("retreat", "nope")).toBeNull();
  });
});

describe("brand preset application", () => {
  it("a preset click writes primary + accent only (no navigation/text/background overwrite)", () => {
    for (const product of ["retreat", "teach", "client_hub"] as const) {
      for (const p of getBrandPresets(product)) {
        expect(Object.keys(presetColorUpdate(p)).sort()).toEqual(["accent", "primary"]);
      }
    }
  });
  it("presets are pure data: resolving them never mutates the registry or any saved brand", () => {
    const before = JSON.stringify(getBrandPresets("retreat"));
    matchBrandPreset("retreat", { primary: "#2D4A3E", accent: "#6B9478" });
    presetColorUpdate(getBrandPresets("retreat")[0]);
    expect(JSON.stringify(getBrandPresets("retreat"))).toBe(before);
  });
  it("every Teach preset resolves through the shared registry with its own colours", () => {
    for (const t of TEACH_PRESETS) {
      const found = findBrandPreset("teach", t.key);
      expect(found).toMatchObject({ primary: t.primary, accent: t.accent, background: t.background });
    }
  });
});

describe("shared image shapes", () => {
  it("offers rectangle, rounded and circle", () => {
    expect([...IMAGE_SHAPES]).toEqual(["rectangle", "rounded", "circle"]);
    expect(isImageShape("circle")).toBe(true);
    expect(isImageShape("hexagon")).toBe(false);
  });
  it("maps shapes to CSS", () => {
    expect(imageShapeRadius("rectangle")).toBe("0px");
    expect(imageShapeRadius("rounded", 12)).toBe("12px");
    expect(imageShapeRadius("circle")).toBe("9999px");
    expect(imageShapeAspect("circle", "4 / 3")).toBe("1 / 1");
    expect(imageShapeAspect("rounded", "4 / 3")).toBe("4 / 3");
  });
  it("maps the Flow atmosphere treatment", () => {
    expect(shapeFromAtmosphereTreatment("square")).toBe("rectangle");
    expect(shapeFromAtmosphereTreatment("rounded")).toBe("rounded");
  });
});
