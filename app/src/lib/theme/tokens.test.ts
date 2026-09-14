import { describe, expect, it } from "vitest";
import { brandConfigSchema, BRAND_COLOR_PRESETS } from "./tokens";

const baseBrand = {
  name: "Test Retreat",
  logoRef: null,
  palette: "forest-sage" as const,
  atmosphere: "calm-organic" as const,
  customNavigation: null,
  customText: null,
};

describe("brandConfigSchema - customPrimary / customSecondary", () => {
  it("accepts null for both (no override)", () => {
    const result = brandConfigSchema.safeParse({ ...baseBrand, customPrimary: null, customSecondary: null });
    expect(result.success).toBe(true);
  });

  it("accepts a valid 6-digit hex for both, independently", () => {
    const result = brandConfigSchema.safeParse({ ...baseBrand, customPrimary: "#2D4A3E", customSecondary: "#C4785A" });
    expect(result.success).toBe(true);
  });

  it("rejects a 3-digit shorthand hex", () => {
    const result = brandConfigSchema.safeParse({ ...baseBrand, customPrimary: "#2D4", customSecondary: null });
    expect(result.success).toBe(false);
  });

  it("rejects a non-hex color name", () => {
    const result = brandConfigSchema.safeParse({ ...baseBrand, customPrimary: "forest", customSecondary: null });
    expect(result.success).toBe(false);
  });

  it("rejects a hex missing the # prefix", () => {
    const result = brandConfigSchema.safeParse({ ...baseBrand, customPrimary: "2D4A3E", customSecondary: null });
    expect(result.success).toBe(false);
  });

  it("requires customSecondary to be present (nullable, not optional)", () => {
    const result = brandConfigSchema.safeParse({ ...baseBrand, customPrimary: null });
    expect(result.success).toBe(false);
  });
});

describe("brandConfigSchema - customNavigation / customText (Final Brand Controls)", () => {
  it("accepts null for both (no override)", () => {
    const result = brandConfigSchema.safeParse({
      ...baseBrand,
      customPrimary: null,
      customSecondary: null,
      customNavigation: null,
      customText: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid 6-digit hex for both, independently of Primary/Accent", () => {
    const result = brandConfigSchema.safeParse({
      ...baseBrand,
      customPrimary: "#2D4A3E",
      customSecondary: "#C4785A",
      customNavigation: "#3B6E8F",
      customText: "#5C4A6B",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed customNavigation hex", () => {
    const result = brandConfigSchema.safeParse({
      ...baseBrand,
      customPrimary: null,
      customSecondary: null,
      customNavigation: "not-a-hex",
      customText: null,
    });
    expect(result.success).toBe(false);
  });

  it("requires customNavigation and customText to be present (nullable, not optional) - same discipline as customSecondary", () => {
    const withoutNewFields: Record<string, unknown> = { ...baseBrand, customPrimary: null, customSecondary: null };
    delete withoutNewFields.customNavigation;
    delete withoutNewFields.customText;
    const result = brandConfigSchema.safeParse(withoutNewFields);
    expect(result.success).toBe(false);
  });
});

describe("brandConfigSchema - logoRef", () => {
  it("accepts a plain Storage-path-shaped string, not just a URL", () => {
    const result = brandConfigSchema.safeParse({
      ...baseBrand,
      customPrimary: null,
      customSecondary: null,
      logoRef: "tenant-id/brand/logo/draft.webp",
    });
    expect(result.success).toBe(true);
  });
});

describe("BRAND_COLOR_PRESETS", () => {
  it("has exactly the 8 approved presets", () => {
    expect(BRAND_COLOR_PRESETS.map((c) => c.label)).toEqual(["Forest", "Sage", "Clay", "Ocean", "Dusk", "Ember", "Stone", "Moss"]);
  });

  it("every preset hex is a valid 6-digit hex accepted by the schema", () => {
    for (const preset of BRAND_COLOR_PRESETS) {
      const result = brandConfigSchema.safeParse({ ...baseBrand, customPrimary: preset.hex, customSecondary: preset.hex });
      expect(result.success).toBe(true);
    }
  });

  it("matches the exact approved hex values", () => {
    const byLabel = Object.fromEntries(BRAND_COLOR_PRESETS.map((c) => [c.label, c.hex]));
    expect(byLabel).toEqual({
      Forest: "#2D4A3E",
      Sage: "#6B9478",
      Clay: "#C4785A",
      Ocean: "#3B6E8F",
      Dusk: "#5C4A6B",
      Ember: "#8F3B3B",
      Stone: "#5C5249",
      Moss: "#4A6B3B",
    });
  });
});
