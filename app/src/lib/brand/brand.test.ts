import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BRAND_PRESET_KEYS, CANONICAL_BRAND_PRESETS, findBrandPreset, getBrandPresets, matchBrandPreset, presetColorUpdate } from "./presets";
import { IMAGE_SHAPES, imageShapeAspect, imageShapeRadius, isImageShape, shapeFromAtmosphereTreatment } from "./imageShape";
import { DEFAULT_TEACH_PRESET, LEGACY_TEACH_FALLBACK, TEACH_LEGACY_PRESETS, presetByKey } from "@/lib/teach/style";
import { parseTeachSetting } from "@/lib/teach/schemas";

const HEX = /^#[0-9a-fA-F]{6}$/;

const CANONICAL = [
  ["Soft Sky", "#5F7F8C", "#B7CED6", "#EAF2F4", "#26343A", "#F6FAFB"],
  ["Sage Light", "#6F846C", "#BAC5B2", "#E7EDE3", "#283229", "#F5F7F2"],
  ["Deep Navy", "#2D4053", "#91A8B8", "#E1E8ED", "#202B34", "#F5F7F8"],
  ["Warm Khaki", "#7B735E", "#C8B98E", "#EEE8D8", "#373329", "#F8F4EB"],
  ["Earth Brown", "#6A4B3A", "#B58E72", "#E9DED5", "#34271F", "#F7F1EC"],
  ["Dusty Rose", "#8B6268", "#D7B4B7", "#F0E3E4", "#3A2B2E", "#FAF5F5"],
  ["Terracotta", "#A86750", "#D6A28D", "#F1E1D8", "#3A2922", "#FBF5F1"],
  ["Forest", "#192B21", "#BAC5B2", "#EBE1D5", "#232926", "#F3EFE7"],
] as const;
const NAMES = CANONICAL.map((r) => r[0]);

describe("canonical brand presets", () => {
  it("Flow shows exactly the 8 canonical names, in order", () => {
    expect(getBrandPresets("retreat").map((p) => p.label)).toEqual(NAMES);
  });
  it("Teach shows exactly the 8 canonical names, in order", () => {
    expect(getBrandPresets("teach").map((p) => p.label)).toEqual(NAMES);
  });
  it("Flow, Teach and Heal resolve identical canonical values from one registry", () => {
    expect(getBrandPresets("retreat")).toBe(getBrandPresets("teach"));
    expect(getBrandPresets("client_hub")).toBe(getBrandPresets("teach"));
    for (const [label, primary, accent, navigation, text, surface] of CANONICAL) {
      for (const product of ["retreat", "teach", "client_hub"] as const) {
        const p = getBrandPresets(product).find((x) => x.label === label);
        expect(p, `${product}/${label}`).toMatchObject({ primary, accent, navigation, text, surface });
      }
    }
  });
  it("keys are unique, valid hex everywhere, and the temporary Flow set is gone", () => {
    const presets = getBrandPresets("retreat");
    expect(new Set(presets.map((p) => p.key)).size).toBe(8);
    for (const p of presets) for (const v of [p.primary, p.accent, p.navigation, p.text, p.surface]) expect(v).toMatch(HEX);
    for (const gone of ["Ocean", "Clay", "Dusk", "Ember", "Stone"]) expect(presets.map((p) => p.label)).not.toContain(gone);
  });
  it("finds presets by key and matches strictly on every persisted role", () => {
    const forest = findBrandPreset("retreat", "forest")!;
    expect(forest.label).toBe("Forest");
    const full = { primary: forest.primary.toLowerCase(), accent: forest.accent, navigation: forest.navigation, text: forest.text };
    expect(matchBrandPreset("retreat", full)?.key).toBe("forest");
    expect(matchBrandPreset("teach", { ...full, surface: forest.surface })?.key).toBe("forest");
    expect(matchBrandPreset("teach", { ...full, surface: "#FFFFFF" })).toBeNull();
    expect(matchBrandPreset("retreat", { ...full, navigation: null })).toBeNull();
    expect(matchBrandPreset("retreat", { ...full, text: "#000000" })).toBeNull();
    expect(matchBrandPreset("retreat", { primary: null, accent: null, navigation: null, text: null })).toBeNull();
    expect(findBrandPreset("retreat", "nope")).toBeNull();
  });
  it("exposes no Heal-specific preset or UI hook", () => {
    expect(Object.keys(getBrandPresets("client_hub")[0]).sort()).toEqual(["accent", "key", "label", "navigation", "primary", "surface", "text"]);
    expect(CANONICAL_BRAND_PRESETS).toBe(getBrandPresets("client_hub"));
  });
});

describe("no alternate Flow palette", () => {
  it("Flow's configurator and the theme tokens carry no separate preset/swatch list", () => {
    const flow = readFileSync(join(__dirname, "..", "..", "app", "(site)", "configurator", "retreat", "retreat-configurator.tsx"), "utf8");
    const tokens = readFileSync(join(__dirname, "..", "theme", "tokens.ts"), "utf8");
    expect(flow).not.toContain("BRAND_COLOR_PRESETS");
    expect(tokens).not.toContain("BRAND_COLOR_PRESETS");
    for (const old of ['"Ocean"', '"Clay"', '"Dusk"', '"Ember"', '"Stone"']) expect(flow).not.toContain(old);
    expect(flow).toContain('getBrandPresets("retreat")');
  });
});

describe("brand preset application", () => {
  it("a preset click applies all five roles for every product (028B: Flow persists a surface too)", () => {
    // Before 028B, Flow had nowhere to store a surface, so a preset click
    // wrote four roles there and five in Teach. brand_configs.custom_surface
    // (0032) closed that gap, so the write is now identical everywhere.
    for (const product of ["retreat", "teach"] as const) {
      for (const p of getBrandPresets(product)) {
        expect(presetColorUpdate(product, p)).toEqual({
          primary: p.primary,
          accent: p.accent,
          navigation: p.navigation,
          text: p.text,
          surface: p.surface,
        });
      }
    }
  });
  it("a Teach preset click applies all five roles including the surface tint", () => {
    for (const p of getBrandPresets("teach")) {
      expect(presetColorUpdate("teach", p)).toEqual({ primary: p.primary, accent: p.accent, navigation: p.navigation, text: p.text, surface: p.surface });
    }
  });
  it("presets are pure data: resolving or applying them never mutates the registry", () => {
    const before = JSON.stringify(getBrandPresets("retreat"));
    matchBrandPreset("retreat", { primary: "#2D4A3E", accent: "#6B9478", navigation: null, text: null });
    presetColorUpdate("retreat", getBrandPresets("retreat")[0]);
    expect(JSON.stringify(getBrandPresets("retreat"))).toBe(before);
  });
});

describe("Teach backward compatibility", () => {
  it("every legacy Teach preset key still parses and resolves with its own saved values", () => {
    for (const t of TEACH_LEGACY_PRESETS) {
      expect(parseTeachSetting("teachStyle", { preset: t.key, background: t.background }).preset).toBe(t.key);
      expect(presetByKey(t.key)).toMatchObject({ primary: t.primary, accent: t.accent, background: t.background });
      expect(findBrandPreset("teach", t.key)).toBeNull();
    }
  });
  it("canonical keys, 'custom' and garbage parse safely", () => {
    for (const k of BRAND_PRESET_KEYS) expect(parseTeachSetting("teachStyle", { preset: k }).preset).toBe(k);
    expect(parseTeachSetting("teachStyle", { preset: "custom" }).preset).toBe("custom");
    expect(parseTeachSetting("teachStyle", { preset: "nope" }).preset).toBe("calm");
  });
  it("a Space with legacy preset + custom colours is parsed untouched (no silent rewrite)", () => {
    const saved = { preset: "earth", background: "#ABCDEF", typography: "serene" };
    const parsed = parseTeachSetting("teachStyle", saved);
    expect(parsed).toMatchObject({ preset: "earth", background: "#ABCDEF", typography: "serene" });
    const custom = parseTeachSetting("teachStyle", { preset: "custom", background: "#123456" });
    expect(custom).toMatchObject({ preset: "custom", background: "#123456" });
  });
  it("new Spaces start from canonical Forest's full model; the pre-registry fallback is separate", () => {
    expect(DEFAULT_TEACH_PRESET).toMatchObject({ key: "forest", primary: "#192B21", navigation: "#EBE1D5", text: "#232926", surface: "#F3EFE7" });
    expect(LEGACY_TEACH_FALLBACK.key).toBe("calm");
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
