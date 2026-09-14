import { describe, expect, it } from "vitest";
import { deriveThemeVars } from "./deriveTheme";
import { meetsAA, contrastRatio, hexToRgb } from "./contrast";
import type { BrandConfig } from "./tokens";

const baseBrand: BrandConfig = {
  name: "Test Retreat",
  logoRef: null,
  palette: "forest-sage",
  customPrimary: "#3B6E8F", // Ocean
  customSecondary: "#C4785A", // Clay
  customNavigation: null,
  customText: null,
  atmosphere: "calm-organic",
  imageStyle: "rounded",
};

describe("deriveThemeVars - Navigation/Tabs Color", () => {
  it("falls back to the resolved primary when customNavigation is unset (old-snapshot shape)", () => {
    const vars = deriveThemeVars(baseBrand);
    expect(vars["--rbr-navigation"]).toBe(baseBrand.customPrimary);
  });

  it("uses customNavigation when the organizer sets one, independent of Primary/Accent", () => {
    const vars = deriveThemeVars({ ...baseBrand, customNavigation: "#8F3B3B" }); // Ember
    expect(vars["--rbr-navigation"]).toBe("#8F3B3B");
    expect(vars["--rbr-navigation"]).not.toBe(vars["--rbr-primary"]);
  });

  it("--rbr-navigation is always legible against the app's light background, even for a very light custom hex", () => {
    const vars = deriveThemeVars({ ...baseBrand, customNavigation: "#F5E6A8" });
    expect(meetsAA(vars["--rbr-background"], vars["--rbr-navigation"])).toBe(true);
  });

  it("--rbr-on-navigation is a real safe-text choice for a solid navigation-colored surface", () => {
    const vars = deriveThemeVars({ ...baseBrand, customNavigation: "#0F1F17" });
    expect(["#FBF9F5", "#1B2E24"]).toContain(vars["--rbr-on-navigation"]);
  });
});

describe("deriveThemeVars - App Text Color", () => {
  it("falls back to the resolved primary when customText is unset (old-snapshot shape)", () => {
    const vars = deriveThemeVars(baseBrand);
    expect(vars["--rbr-text"]).toBe(baseBrand.customPrimary);
  });

  it("uses customText when the organizer sets one, independent of Primary/Accent/Navigation", () => {
    const vars = deriveThemeVars({ ...baseBrand, customText: "#5C4A6B", customNavigation: "#8F3B3B" }); // Dusk text, Ember nav
    expect(vars["--rbr-text"]).toBe("#5C4A6B");
    expect(vars["--rbr-text"]).not.toBe(vars["--rbr-navigation"]);
    expect(vars["--rbr-text"]).not.toBe(vars["--rbr-primary"]);
  });

  it("--rbr-text is always legible against the app's light background, even for a very light custom hex", () => {
    const vars = deriveThemeVars({ ...baseBrand, customText: "#F5E6A8" });
    expect(meetsAA(vars["--rbr-background"], vars["--rbr-text"])).toBe(true);
  });

  it("preserves an already-dark custom text color exactly", () => {
    const vars = deriveThemeVars({ ...baseBrand, customText: "#2D4A3E" });
    expect(vars["--rbr-text"]).toBe("#2D4A3E");
  });
});

describe("deriveThemeVars - Explore alternating brand surfaces (Primary/Accent + -dark anchors)", () => {
  it("provides an --rbr-on-secondary for text on a SOLID accent surface, mirroring --rbr-on-primary", () => {
    const vars = deriveThemeVars(baseBrand);
    expect(["#FBF9F5", "#1B2E24"]).toContain(vars["--rbr-on-secondary"]);
  });

  it("--rbr-primary-dark / --rbr-secondary-dark stay dark enough for fixed-white overlay text, even for a very light custom color", () => {
    const vars = deriveThemeVars({ ...baseBrand, customPrimary: "#F5E6A8", customSecondary: "#FDF6D8" });
    expect(meetsAA(vars["--rbr-primary-dark"], "#FFFFFF")).toBe(true);
    expect(meetsAA(vars["--rbr-secondary-dark"], "#FFFFFF")).toBe(true);
  });

  it("-dark variants differ from their raw color (visibly darkened, not a no-op) and from each other (Primary vs Accent stay distinguishable)", () => {
    const vars = deriveThemeVars(baseBrand);
    expect(vars["--rbr-primary-dark"]).not.toBe(vars["--rbr-primary"]);
    expect(vars["--rbr-secondary-dark"]).not.toBe(vars["--rbr-secondary"]);
    expect(vars["--rbr-primary-dark"]).not.toBe(vars["--rbr-secondary-dark"]);
  });
});

describe("deriveThemeVars - text-muted and text-on-primary-soft", () => {
  it("--rbr-text-muted is derived from Text color, not a fixed gray - changes when customText changes", () => {
    const a = deriveThemeVars({ ...baseBrand, customText: "#8F3B3B" }); // Ember
    const b = deriveThemeVars({ ...baseBrand, customText: "#5C4A6B" }); // Dusk
    expect(a["--rbr-text-muted"]).not.toBe(b["--rbr-text-muted"]);
  });

  it("--rbr-text-muted is genuinely quieter (closer to the neutral mist tone) than full-strength --rbr-text", () => {
    const vars = deriveThemeVars({ ...baseBrand, customText: "#8F3B3B" });
    // A muted tone blended toward mist should read with lower contrast
    // against the background than the full-strength text color - "quieter"
    // in the same sense a caption is quieter than a heading.
    const bg = hexToRgb(vars["--rbr-background"]);
    const fullContrast = contrastRatio(bg, hexToRgb(vars["--rbr-text"]));
    const mutedContrast = contrastRatio(bg, hexToRgb(vars["--rbr-text-muted"]));
    expect(mutedContrast).toBeLessThan(fullContrast);
  });

  it("--rbr-text-on-primary-soft is legible against --rbr-primary-soft specifically, even when that differs from the plain background", () => {
    const vars = deriveThemeVars({ ...baseBrand, customPrimary: "#8F3B3B", customText: "#F5E6A8" }); // Ember primary, very light text
    expect(meetsAA(vars["--rbr-primary-soft"], vars["--rbr-text-on-primary-soft"])).toBe(true);
  });
});

describe("deriveThemeVars - required contrast combinations (brief section 14)", () => {
  const cases: Array<[string, Partial<BrandConfig>]> = [
    ["Forest primary + Clay accent + Forest text", { customPrimary: "#2D4A3E", customSecondary: "#C4785A", customText: "#2D4A3E" }],
    ["Ocean primary + Clay accent + Dusk text", { customPrimary: "#3B6E8F", customSecondary: "#C4785A", customText: "#5C4A6B" }],
    ["Clay primary + Forest accent + Dusk text", { customPrimary: "#C4785A", customSecondary: "#2D4A3E", customText: "#5C4A6B" }],
    ["Dusk primary + Sage accent + Forest text", { customPrimary: "#5C4A6B", customSecondary: "#6B9478", customText: "#2D4A3E" }],
    ["Ember primary + Ocean accent + very dark text", { customPrimary: "#8F3B3B", customSecondary: "#3B6E8F", customText: "#0F1F17" }],
    ["very light custom Primary", { customPrimary: "#F5E6A8" }],
    ["very light custom Accent", { customSecondary: "#FDF6D8" }],
    ["very light custom Text", { customText: "#FBF6E3" }],
    ["very dark custom Navigation", { customNavigation: "#0A0A0A" }],
  ];

  for (const [label, overrides] of cases) {
    it(`${label} - every text-bearing token stays AA-legible on its real surface`, () => {
      const vars = deriveThemeVars({ ...baseBrand, ...overrides });
      expect(meetsAA(vars["--rbr-background"], vars["--rbr-text"])).toBe(true);
      expect(meetsAA(vars["--rbr-background"], vars["--rbr-navigation"])).toBe(true);
      expect(meetsAA(vars["--rbr-primary-soft"], vars["--rbr-primary-foreground"])).toBe(true);
      expect(meetsAA(vars["--rbr-secondary-soft"], vars["--rbr-secondary-foreground"])).toBe(true);
      expect(meetsAA(vars["--rbr-primary-soft"], vars["--rbr-text-on-primary-soft"])).toBe(true);
      expect(meetsAA(vars["--rbr-primary-dark"], "#FFFFFF")).toBe(true);
      expect(meetsAA(vars["--rbr-secondary-dark"], "#FFFFFF")).toBe(true);
    });
  }
});

describe("deriveThemeVars - old snapshot backward compatibility", () => {
  it("a pre-Final-Brand-Controls config (no customNavigation/customText keys at runtime) still derives a complete, legible theme", () => {
    // Mirrors what publishedThemeSchema hands back for a snapshot published
    // before these two fields existed - customNavigation/customText come
    // back as undefined, not null, since they're .optional() there (see
    // publishedTheme.ts), then get normalized to null before reaching
    // deriveThemeVars (see published-space-screen.tsx's `?? null`).
    const oldShapeBrand = { ...baseBrand };
    const vars = deriveThemeVars(oldShapeBrand);
    expect(vars["--rbr-navigation"]).toBeTruthy();
    expect(vars["--rbr-text"]).toBeTruthy();
    expect(meetsAA(vars["--rbr-background"], vars["--rbr-navigation"])).toBe(true);
    expect(meetsAA(vars["--rbr-background"], vars["--rbr-text"])).toBe(true);
  });
});
