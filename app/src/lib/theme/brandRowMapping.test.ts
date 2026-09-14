import { describe, expect, it } from "vitest";
import { mapBrandRowToInitialProps, type BrandConfigsRow } from "./brandRowMapping";

const fullRow: BrandConfigsRow = {
  palette: "warm-earth",
  atmosphere: "warm-earthy",
  custom_primary: "#3B6E8F",
  custom_secondary: "#8F3B3B",
  custom_navigation: "#6B9478",
  custom_text: "#5C4A6B",
  hero_image_ref: "tenant-1/brand/hero/draft.webp",
  space_image_ref: "tenant-1/brand/space/draft.webp",
  logo_ref: "tenant-1/brand/logo/draft.webp",
};

describe("mapBrandRowToInitialProps - the exact DB-to-initial-state mapping that was reported broken", () => {
  it("maps every saved field through exactly, snake_case DB column to camelCase initial prop", () => {
    const props = mapBrandRowToInitialProps(fullRow);
    expect(props).toEqual({
      initialPalette: "warm-earth",
      initialAtmosphere: "warm-earthy",
      initialCustomPrimary: "#3B6E8F",
      initialCustomSecondary: "#8F3B3B",
      initialCustomNavigation: "#6B9478",
      initialCustomText: "#5C4A6B",
      initialHeroImageRef: "tenant-1/brand/hero/draft.webp",
      initialSpaceImageRef: "tenant-1/brand/space/draft.webp",
      initialLogoRef: "tenant-1/brand/logo/draft.webp",
    });
  });

  it("each of the four colors maps independently - changing one never affects another's mapped value", () => {
    const onlyNavigationSet: BrandConfigsRow = { ...fullRow, custom_primary: null, custom_secondary: null, custom_text: null };
    const props = mapBrandRowToInitialProps(onlyNavigationSet);
    expect(props.initialCustomNavigation).toBe("#6B9478");
    expect(props.initialCustomPrimary).toBeNull();
    expect(props.initialCustomSecondary).toBeNull();
    expect(props.initialCustomText).toBeNull();
  });

  it("a row with every color column null maps to null for all four - never a stale/default color silently substituted", () => {
    const emptyRow: BrandConfigsRow = {
      ...fullRow,
      custom_primary: null,
      custom_secondary: null,
      custom_navigation: null,
      custom_text: null,
    };
    const props = mapBrandRowToInitialProps(emptyRow);
    expect(props.initialCustomPrimary).toBeNull();
    expect(props.initialCustomSecondary).toBeNull();
    expect(props.initialCustomNavigation).toBeNull();
    expect(props.initialCustomText).toBeNull();
  });

  it("a completely missing row (brand-new, never-saved tenant) falls back to documented defaults, not a crash", () => {
    const props = mapBrandRowToInitialProps(null);
    expect(props).toEqual({
      initialPalette: "forest-sage",
      initialAtmosphere: "calm-organic",
      initialCustomPrimary: null,
      initialCustomSecondary: null,
      initialCustomNavigation: null,
      initialCustomText: null,
      initialHeroImageRef: null,
      initialSpaceImageRef: null,
      initialLogoRef: null,
    });
  });

  it("maps all three brand image refs (hero/space/logo) independently", () => {
    const props = mapBrandRowToInitialProps(fullRow);
    expect(props.initialHeroImageRef).toBe("tenant-1/brand/hero/draft.webp");
    expect(props.initialSpaceImageRef).toBe("tenant-1/brand/space/draft.webp");
    expect(props.initialLogoRef).toBe("tenant-1/brand/logo/draft.webp");
  });

  it("old tenants with null brand images map cleanly to null, not undefined or a crash", () => {
    const noImages: BrandConfigsRow = { ...fullRow, hero_image_ref: null, space_image_ref: null, logo_ref: null };
    const props = mapBrandRowToInitialProps(noImages);
    expect(props.initialHeroImageRef).toBeNull();
    expect(props.initialSpaceImageRef).toBeNull();
    expect(props.initialLogoRef).toBeNull();
  });
});
