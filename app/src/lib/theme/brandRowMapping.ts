/**
 * The exact mapping from a `brand_configs` database row to the
 * configurator's initial client props - pulled out of
 * `configurator/retreat/[tenantId]/page.tsx` specifically so the Manual
 * QA Fixes "colors don't survive refresh" bug class has a real regression
 * test at the mapping layer, not only at deriveThemeVars (which never
 * touches the database at all and could not have caught a snake_case/
 * camelCase or null-vs-default mistake here).
 *
 * `row` is `null`/`undefined` whenever a tenant has no brand_configs row
 * yet (a brand-new, never-saved space) - every field falls back to its
 * documented default, matching what a first-time Identity/Brand step
 * already assumes.
 */
export type BrandConfigsRow = {
  palette: string | null;
  atmosphere: string | null;
  custom_primary: string | null;
  custom_secondary: string | null;
  custom_navigation: string | null;
  custom_text: string | null;
  hero_image_ref: string | null;
  space_image_ref: string | null;
  logo_ref: string | null;
} | null;

export type BrandInitialProps = {
  initialPalette: string;
  initialAtmosphere: string;
  initialCustomPrimary: string | null;
  initialCustomSecondary: string | null;
  initialCustomNavigation: string | null;
  initialCustomText: string | null;
  initialHeroImageRef: string | null;
  initialSpaceImageRef: string | null;
  initialLogoRef: string | null;
};

export function mapBrandRowToInitialProps(row: BrandConfigsRow): BrandInitialProps {
  return {
    initialPalette: row?.palette ?? "forest-sage",
    initialAtmosphere: row?.atmosphere ?? "calm-organic",
    initialCustomPrimary: row?.custom_primary ?? null,
    initialCustomSecondary: row?.custom_secondary ?? null,
    initialCustomNavigation: row?.custom_navigation ?? null,
    initialCustomText: row?.custom_text ?? null,
    initialHeroImageRef: row?.hero_image_ref ?? null,
    initialSpaceImageRef: row?.space_image_ref ?? null,
    initialLogoRef: row?.logo_ref ?? null,
  };
}
