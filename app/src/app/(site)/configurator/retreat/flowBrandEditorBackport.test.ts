import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * release/033-ux-fast (backport of 94344fd): owner requirements for the
 * Flow Brand step. The configurator is too large to render in a unit test,
 * so the wiring of the BrandPaletteEditor call site is guarded at source
 * level (same approach as studioDirtyWiring.test.ts).
 */
const src = readFileSync(join(__dirname, "retreat-configurator.tsx"), "utf8");
const start = src.indexOf("<BrandPaletteEditor");
const end = src.indexOf("/>\n            </div>", start);
const call = src.slice(start, end);

describe("Flow Brand editor (backport)", () => {
  it("mounts the shared editor exactly once", () => {
    expect(start).toBeGreaterThan(-1);
    expect(src.split("<BrandPaletteEditor").length - 1).toBe(1);
  });

  it("does not offer Background tint (custom_surface is not rendered by the Flow Guest App)", () => {
    expect(call).toContain("showSurface={false}");
    expect(call).not.toContain('"backgroundTintHelp"');
  });

  it("keeps the navigation and text colour pickers reachable under Advanced, writing the same state and marking the Brand dirty", () => {
    const adv = call.slice(call.indexOf("advanced={"), call.indexOf("onApplyPreset="));
    expect(adv).toContain('t("studio", "navigationColour")');
    expect(adv).toContain("value={effectiveNavigation}");
    expect(adv).toMatch(/setCustomNavigation\(hex\);\s*dirty\.markDirty\("identityAndBrand"\);/);
    expect(adv).toContain('t("studio", "textColour")');
    expect(adv).toContain("value={effectiveText}");
    expect(adv).toMatch(/setCustomText\(hex\);\s*dirty\.markDirty\("identityAndBrand"\);/);
  });

  it("a preset still writes all five roles (including the saved surface) and no colour role is silently dropped", () => {
    const applyStart = call.indexOf("onApplyPreset=");
    const apply = call.slice(applyStart, call.indexOf("onChange=", applyStart));
    expect(applyStart).toBeGreaterThan(-1);
    for (const setter of ["setCustomPrimary(next.primary)", "setCustomSecondary(next.accent)", "setCustomNavigation(next.navigation)", "setCustomText(next.text)", "setCustomSurface(next.surface ?? null)"]) {
      expect(apply).toContain(setter);
    }
    // the hidden form fields that Save submits are unchanged
    for (const name of ["customPrimary", "customSecondary", "customNavigation", "customText", "customSurface"]) {
      expect(src).toContain(`name="${name}"`);
    }
  });
});
