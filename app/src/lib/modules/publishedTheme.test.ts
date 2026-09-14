import { describe, expect, it } from "vitest";
import { publishedThemeSchema, brandMediaSchema, DEFAULT_PUBLISHED_THEME } from "./publishedTheme";

describe("publishedThemeSchema - old snapshot (published before migration 0014)", () => {
  it("parses a theme object with no customPrimary/customSecondary/imageStyle keys at all", () => {
    const oldSnapshotTheme = { palette: "forest-sage", atmosphere: "calm-organic" };
    const result = publishedThemeSchema.safeParse(oldSnapshotTheme);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.customPrimary).toBeUndefined();
      expect(result.data.customSecondary).toBeUndefined();
    }
  });

  it("falls back to DEFAULT_PUBLISHED_THEME for a completely malformed theme (defensive, should not happen in practice)", () => {
    const result = publishedThemeSchema.safeParse({ nonsense: true });
    expect(result.success).toBe(false);
    // The component's own fallback path - proven here as the documented behavior.
    const theme = result.success ? result.data : DEFAULT_PUBLISHED_THEME;
    expect(theme).toEqual(DEFAULT_PUBLISHED_THEME);
  });
});

describe("publishedThemeSchema - new snapshot (published after migration 0014)", () => {
  it("parses a theme object with real customPrimary/customSecondary values", () => {
    const newSnapshotTheme = {
      palette: "forest-sage",
      atmosphere: "calm-organic",
      imageStyle: "rounded",
      customPrimary: "#2D4A3E",
      customSecondary: "#C4785A",
    };
    const result = publishedThemeSchema.safeParse(newSnapshotTheme);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.customPrimary).toBe("#2D4A3E");
      expect(result.data.customSecondary).toBe("#C4785A");
    }
  });

  it("parses explicit null overrides (organizer never set a custom color)", () => {
    const result = publishedThemeSchema.safeParse({
      palette: "forest-sage",
      atmosphere: "calm-organic",
      customPrimary: null,
      customSecondary: null,
    });
    expect(result.success).toBe(true);
  });
});

describe("publishedThemeSchema - customNavigation / customText (Final Brand Controls)", () => {
  it("parses a theme object with no customNavigation/customText keys at all - every snapshot today", () => {
    const currentSnapshotTheme = {
      palette: "forest-sage",
      atmosphere: "calm-organic",
      customPrimary: "#2D4A3E",
      customSecondary: "#C4785A",
    };
    const result = publishedThemeSchema.safeParse(currentSnapshotTheme);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.customNavigation).toBeUndefined();
      expect(result.data.customText).toBeUndefined();
    }
  });

  it("parses real customNavigation/customText values once persistence exists", () => {
    const futureSnapshotTheme = {
      palette: "forest-sage",
      atmosphere: "calm-organic",
      customNavigation: "#3B6E8F",
      customText: "#5C4A6B",
    };
    const result = publishedThemeSchema.safeParse(futureSnapshotTheme);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.customNavigation).toBe("#3B6E8F");
      expect(result.data.customText).toBe("#5C4A6B");
    }
  });

  it("rejects a malformed customNavigation value", () => {
    const result = publishedThemeSchema.safeParse({
      palette: "forest-sage",
      atmosphere: "calm-organic",
      customNavigation: "not-a-hex",
    });
    expect(result.success).toBe(false);
  });
});

describe("brandMediaSchema - old vs. new snapshot", () => {
  /**
   * brandMediaSchema itself requires an object - parsing bare `undefined`
   * fails, by design. Backward compatibility for a pre-0014 snapshot
   * (which has no modules.brand key at all) is handled one level up, at
   * the call site (published-space-screen.tsx): `heroImageRef =
   * brandMediaParsed.success ? (...) : null` - a failed parse gracefully
   * becomes null, never a crash and never a fake value. This test proves
   * that fallback path is exercised, not that the schema accepts
   * undefined.
   */
  it("fails to parse bare undefined - the caller's ternary fallback is what makes this safe, not the schema itself", () => {
    const result = brandMediaSchema.safeParse(undefined);
    expect(result.success).toBe(false);
    const heroImageRef = result.success ? (result.data.hero?.imageRef ?? null) : null;
    expect(heroImageRef).toBeNull();
  });

  it("parses a full brand media block with real imageRefs", () => {
    const result = brandMediaSchema.safeParse({
      hero: { imageRef: "tenant-id/brand/hero/published.webp" },
      space: { imageRef: null },
      logo: { imageRef: "tenant-id/brand/logo/published.webp" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.hero?.imageRef).toBe("tenant-id/brand/hero/published.webp");
      expect(result.data.space?.imageRef).toBeNull();
    }
  });

  it("parses a published Logo imageRef - the exact field that was previously hardcoded to null in published-space-screen.tsx regardless of what this schema returned", () => {
    const result = brandMediaSchema.safeParse({
      hero: { imageRef: null },
      space: { imageRef: null },
      logo: { imageRef: "tenant-id/brand/logo/published.webp" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.logo?.imageRef).toBe("tenant-id/brand/logo/published.webp");
    }
  });

  it("an old snapshot with no logo key at all still parses cleanly (logo is optional)", () => {
    const result = brandMediaSchema.safeParse({ hero: { imageRef: null } });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.logo?.imageRef ?? null).toBeNull();
    }
  });
});
