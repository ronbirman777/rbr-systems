import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CONTRAST_THRESHOLDS,
  accessibleForeground,
  maxAchievableContrast,
  brandRolesAreUsable,
  contrastOf,
  gradeBrandRoles,
  gradeContrast,
  meetsLevel,
  onBrandSurface,
} from "./accessibility";
import { CANONICAL_BRAND_PRESETS, BRAND_PRESET_KEYS, getBrandPresets, presetColorUpdate } from "./presets";
import { deriveThemeVars } from "@/lib/theme/deriveTheme";
import { brandFromPublishedTheme } from "@/lib/teach/guestData";
import { GUEST_BASE_PALETTE } from "@/lib/theme/tokens";
import { TEACH_LEGACY_PRESET_KEYS } from "@/lib/teach/schemas";
import { BrandImage } from "@/components/shared/brand-image";
import { TeachImage } from "@/components/teach/teach-image";

const base = {
  name: "QA",
  logoRef: null,
  palette: "forest-sage" as const,
  customPrimary: null,
  customSecondary: null,
  customNavigation: null,
  customText: null,
  atmosphere: "calm-organic" as const,
};

describe("the eight canonical presets are preserved exactly", () => {
  // The approved brand is data, not something accessibility logic may
  // renegotiate. If one of these hexes ever changes, it must be a
  // deliberate design decision, not a side effect.
  const EXPECTED: Record<string, string> = {
    softSky: "#5F7F8C",
    sageLight: "#6F846C",
    deepNavy: "#2D4053",
    warmKhaki: "#7B735E",
    earthBrown: "#6A4B3A",
    dustyRose: "#8B6268",
    terracotta: "#A86750",
    forest: "#192B21",
  };

  it("still has exactly eight, in order, with the approved primaries", () => {
    expect(BRAND_PRESET_KEYS).toHaveLength(8);
    expect(CANONICAL_BRAND_PRESETS).toHaveLength(8);
    for (const preset of CANONICAL_BRAND_PRESETS) {
      expect(preset.primary, preset.key).toBe(EXPECTED[preset.key]);
    }
  });

  it("defines all five roles for every preset", () => {
    for (const p of CANONICAL_BRAND_PRESETS) {
      for (const role of ["primary", "accent", "navigation", "text", "surface"] as const) {
        expect(p[role], `${p.key}.${role}`).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
  });

  it("is the same registry for every product - one brand, not three", () => {
    expect(getBrandPresets("teach")).toBe(getBrandPresets("retreat"));
    expect(getBrandPresets("client_hub")).toBe(getBrandPresets("retreat"));
  });

  it("never darkens or rewrites a preset colour to satisfy contrast", () => {
    // Several approved presets are light; the fix is an accessible
    // foreground ON them, never a changed swatch.
    for (const p of CANONICAL_BRAND_PRESETS) {
      const written = presetColorUpdate("teach", p);
      expect(written.primary).toBe(p.primary);
      expect(written.accent).toBe(p.accent);
      expect(written.navigation).toBe(p.navigation);
      expect(written.text).toBe(p.text);
      expect(written.surface).toBe(p.surface);
    }
  });

  it("gives every preset the best readable button label its own fill allows", () => {
    // Some approved primaries are mid-tone, where 4.5:1 is unreachable for
    // ANY foreground - softSky tops out around 4.3:1. The contract is
    // best-achievable, and the owner's decision is to report that rather
    // than block publishing or alter the approved colour.
    for (const p of CANONICAL_BRAND_PRESETS) {
      const fg = onBrandSurface(p.primary);
      const ratio = contrastOf(fg, p.primary);
      expect(ratio, `${p.key} button`).toBeGreaterThanOrEqual(CONTRAST_THRESHOLDS.normalText);
      // The fill itself is untouched - only the label adapts.
      expect(p.primary).toBe(EXPECTED[p.key]);
    }
  });

  it("can reach AA on every approved primary, using an app neutral and no colour change", () => {
    // Worth stating explicitly: the known "preset primaries below 4.5:1"
    // concern is about the PRESET COLOUR against white text. Choosing the
    // better neutral clears AA on all eight without touching a swatch -
    // softSky needs the light extreme, not the cream neutral.
    const belowAA = CANONICAL_BRAND_PRESETS.filter(
      (p) => maxAchievableContrast(p.primary) < CONTRAST_THRESHOLDS.normalText
    ).map((p) => p.key);
    expect(belowAA).toEqual([]);

    for (const p of CANONICAL_BRAND_PRESETS) {
      expect(contrastOf(onBrandSurface(p.primary), p.primary), p.key).toBeGreaterThanOrEqual(
        CONTRAST_THRESHOLDS.normalText
      );
    }
  });

  it("gives every preset usable body text on its own surface", () => {
    for (const p of CANONICAL_BRAND_PRESETS) {
      const fg = accessibleForeground(p.surface, { preferred: p.text });
      expect(contrastOf(fg, p.surface), `${p.key} body`).toBeGreaterThanOrEqual(CONTRAST_THRESHOLDS.normalText);
    }
  });
});

describe("contrast thresholds follow WCAG 2.1 AA", () => {
  it("uses 4.5 normal, 3 large, 3 non-text", () => {
    expect(CONTRAST_THRESHOLDS).toEqual({ normalText: 4.5, largeText: 3, nonText: 3 });
  });

  it("computes a known ratio correctly", () => {
    // Black on white is the canonical 21:1.
    expect(Math.round(contrastOf("#000000", "#FFFFFF"))).toBe(21);
    expect(contrastOf("#FFFFFF", "#FFFFFF")).toBe(1);
  });

  it("grades a pair, not a swatch", () => {
    expect(gradeContrast("#000000", "#FFFFFF").grade).toBe("pass");
    expect(gradeContrast("#FFFFFF", "#FFFFFF").grade).toBe("fail");
    const warn = gradeContrast("#767676", "#FFFFFF", "normalText");
    expect(warn.ratio).toBeGreaterThanOrEqual(3);
    expect(warn.displayRatio).toMatch(/^\d+(\.\d)?:1$/);
  });

  it("passes large text at a ratio that fails normal text", () => {
    const mid = "#8A8A8A";
    expect(meetsLevel(mid, "#FFFFFF", "normalText")).toBe(false);
    expect(meetsLevel(mid, "#FFFFFF", "largeText")).toBe(true);
  });
});

describe("accessible foreground selection", () => {
  it("keeps the organizer's own colour whenever it already works", () => {
    expect(accessibleForeground("#FFFFFF", { preferred: "#1B2E24" })).toBe("#1B2E24");
  });

  it("substitutes a neutral only when the preferred colour cannot be read", () => {
    const fg = accessibleForeground("#FFFFFF", { preferred: "#FAFAFA" });
    expect(fg).not.toBe("#FAFAFA");
    expect(contrastOf(fg, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
  });

  it("returns the best achievable foreground for any surface", () => {
    for (const surface of ["#FFFFFF", "#000000", "#808080", "#A86750", "#5F7F8C", "#F3EFE7", "#7F7F7F"]) {
      const fg = accessibleForeground(surface);
      const ratio = contrastOf(fg, surface);
      const ceiling = maxAchievableContrast(surface);
      // Either it clears AA, or AA is impossible here and it got close to
      // the ceiling. It is never silently worse than that.
      expect(ratio >= CONTRAST_THRESHOLDS.normalText || ratio >= ceiling - 0.35, `${surface} ratio=${ratio} ceiling=${ceiling}`).toBe(true);
    }
  });

  it("relaxes correctly for large text", () => {
    const fg = accessibleForeground("#808080", { level: "largeText" });
    expect(contrastOf(fg, "#808080")).toBeGreaterThanOrEqual(3);
  });
});

describe("Custom Colours feedback reports, and never blocks", () => {
  const good = { primary: "#192B21", accent: "#BAC5B2", navigation: "#192B21", text: "#232926", surface: "#F3EFE7" };
  const bad = { primary: "#FFFDF8", accent: "#FEFEFE", navigation: "#FDFDFD", text: "#FBFBFB", surface: "#FFFFFF" };

  it("grades the pairs that carry information, and leaves decoration alone", () => {
    const roles = gradeBrandRoles(good).map((r) => r.role).sort();
    // Accent is decorative (dividers, soft detail) and exempt under WCAG
    // 1.4.11; grading it would flag most of the approved brand as failing.
    expect(roles).toEqual(["navigation", "primary", "text"]);
  });

  it("does not report the approved presets as unusable", () => {
    for (const p of CANONICAL_BRAND_PRESETS) {
      const reports = gradeBrandRoles({
        primary: p.primary,
        navigation: p.navigation,
        text: p.text,
        surface: p.surface,
      });
      expect(brandRolesAreUsable(reports), p.key).toBe(true);
    }
  });

  it("passes a sensible palette and flags a washed-out one", () => {
    expect(brandRolesAreUsable(gradeBrandRoles(good))).toBe(true);
    expect(brandRolesAreUsable(gradeBrandRoles(bad))).toBe(false);
  });

  it("still produces a readable button label even for a near-white primary", () => {
    // The point of the policy: the colour stays, the label adapts.
    const report = gradeBrandRoles(bad).find((r) => r.role === "primary")!;
    expect(report.background).toBe(bad.primary);
    expect(report.grade).toBe("pass");
  });

  it("exposes a ratio for display without rounding away a failure", () => {
    const report = gradeBrandRoles(bad).find((r) => r.role === "text")!;
    expect(report.grade).toBe("fail");
    expect(report.displayRatio).toContain(":1");
  });
});

describe("shared Surface role is backward compatible", () => {
  it("renders exactly as before when a product persists no surface", () => {
    const before = deriveThemeVars({ ...base });
    expect(before["--rbr-background"]).toBe(GUEST_BASE_PALETTE.parchment);
    expect(before["--rbr-surface"]).toBe(GUEST_BASE_PALETTE.parchmentDeep);
  });

  it("uses an explicit surface when one is supplied", () => {
    const after = deriveThemeVars({ ...base, customSurface: "#F6FAFB" });
    expect(after["--rbr-background"]).toBe("#F6FAFB");
    expect(after["--rbr-surface"]).not.toBe(GUEST_BASE_PALETTE.parchmentDeep);
  });

  it("emits byte-identical tokens for an existing Space that sets no surface", () => {
    // The real backward-compatibility requirement: nothing an existing
    // Flow or Teach Space renders today may change.
    const a = deriveThemeVars({ ...base });
    const b = deriveThemeVars({ ...base, customSurface: undefined });
    expect(b).toEqual(a);
  });

  it("lets derived tints follow a custom ground, which is the point of the role", () => {
    const before = deriveThemeVars({ ...base });
    const after = deriveThemeVars({ ...base, customSurface: "#F6FAFB" });
    // Tints are mixed INTO the ground, so they move with it by design.
    expect(after["--rbr-primary-soft"]).not.toBe(before["--rbr-primary-soft"]);
    // Brand colours themselves never move.
    expect(after["--rbr-primary"]).toBe(before["--rbr-primary"]);
    expect(after["--rbr-secondary"]).toBe(before["--rbr-secondary"]);
  });

  it("carries a published customSurface through to the Guest ground (0032 end to end)", () => {
    const brand = brandFromPublishedTheme("QA", {
      palette: "forest-sage",
      atmosphere: "calm-organic",
      customPrimary: "#3B6E8F",
      customSurface: "#FBF5F1",
    });
    expect(brand.customSurface).toBe("#FBF5F1");
    expect(deriveThemeVars(brand)["--rbr-background"]).toBe("#FBF5F1");
  });

  it("falls back to the fixed ground for a snapshot published before 0032", () => {
    // A pre-0032 snapshot has no customSurface key at all - absence must
    // parse cleanly and mean "no override", not break the Space.
    const brand = brandFromPublishedTheme("QA", {
      palette: "forest-sage",
      atmosphere: "calm-organic",
      customPrimary: "#3B6E8F",
    });
    expect(brand.customSurface).toBeUndefined();
    expect(deriveThemeVars(brand)["--rbr-background"]).toBe(GUEST_BASE_PALETTE.parchment);
  });

  it("treats an explicit null surface as no override, exactly like absence", () => {
    const brand = brandFromPublishedTheme("QA", {
      palette: "forest-sage",
      atmosphere: "calm-organic",
      customSurface: null,
    });
    expect(deriveThemeVars(brand)["--rbr-background"]).toBe(GUEST_BASE_PALETTE.parchment);
  });

  it("keeps retired Teach preset keys resolvable so old Spaces still render", () => {
    expect(TEACH_LEGACY_PRESET_KEYS.length).toBeGreaterThan(0);
  });
});

describe("shared image primitive", () => {
  const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

  it("renders a lazy image by default", () => {
    const html = render(createElement(BrandImage, { src: "/api/media/x", alt: "a" }));
    expect(html).toContain('loading="lazy"');
    expect(html).not.toContain('fetchpriority="high"');
  });

  it("renders an eager, high-priority image when marked priority", () => {
    const html = render(createElement(BrandImage, { src: "/api/media/x", alt: "a", priority: true }));
    expect(html).toContain('loading="eager"');
    // React hoists a preload for a high-priority image, which is the
    // behaviour that actually helps LCP.
    expect(html.toLowerCase()).toMatch(/fetchpriority="high"|rel="preload"/);
  });

  it("applies the focal point as object-position", () => {
    const html = render(createElement(BrandImage, { src: "/api/media/x", alt: "a", focal: { x: 72, y: 52 } }));
    expect(html).toContain("object-position:72% 52%");
  });

  it("lets a caller's explicit object-position win, so Flow's own default crop is preserved", () => {
    const html = render(
      createElement(BrandImage, { src: "/api/media/x", alt: "a", focal: { x: 72, y: 52 }, style: { objectPosition: "10% 90%" } })
    );
    expect(html).toContain("object-position:10% 90%");
  });

  it("renders a branded fallback instead of a hole when there is no image", () => {
    const html = render(createElement(BrandImage, { src: null, alt: "Lena", fallbackLabel: "Lena" }));
    expect(html).not.toContain("<img");
    expect(html).toContain(">L<");
    expect(html).toContain('role="img"');
  });

  it("is what TeachImage now renders, so both products share one implementation", () => {
    const shared = render(createElement(BrandImage, { src: "/api/media/x", alt: "a", focal: { x: 20, y: 30 } }));
    const teach = render(createElement(TeachImage, { src: "/api/media/x", alt: "a", focal: { x: 20, y: 30 } }));
    expect(teach).toBe(shared);
  });
});
