import {
  ATMOSPHERES,
  PALETTES,
  GUEST_BASE_PALETTE,
  GUEST_FONT_DISPLAY,
  GUEST_FONT_UI,
  type BrandConfig,
} from "./tokens";
import { safeTextColor, deriveSoftSurface, deriveAccessibleForeground, deriveGuaranteedDarkSurface, mixHex } from "./contrast";

/**
 * Turns a validated BrandConfig into concrete CSS custom properties.
 * This is the ONLY path from customer input to rendered style - there is no
 * custom CSS, HTML, or JS input surface anywhere in the configurator.
 *
 * Product Completion phase: --rbr-primary/--rbr-secondary derive from the
 * tenant's own choice - palette as the base, with customPrimary/
 * customSecondary as independent optional overrides (mirroring each
 * other exactly; customSecondary requires migration 0014 to actually
 * persist a non-null value, but the fallback here is written to behave
 * correctly regardless of whether that column exists yet - a tenant with
 * no override keeps deriving secondary from palette exactly as before).
 * Everything else - background/surface hex, the full named base palette,
 * and the two font roles - now comes from GUEST_BASE_PALETTE /
 * GUEST_FONT_DISPLAY / GUEST_FONT_UI (the approved Figma source of
 * truth), fixed and identical for every tenant, never customer-facing.
 * atmosphere still selects between two surface tones (unchanged
 * mechanism, so existing tenant data keeps working exactly as before) -
 * only the underlying hex values moved from ad-hoc placeholders to the
 * two closest Figma-approved tones (cream for "crisp", parchment-deep
 * for "soft"/"warm").
 */
export function deriveThemeVars(config: BrandConfig): Record<string, string> {
  const palette = PALETTES[config.palette];
  const atmosphere = ATMOSPHERES[config.atmosphere];
  const primary = config.customPrimary ?? palette.primary;
  const secondary = config.customSecondary ?? palette.secondary;
  const onPrimary = safeTextColor(primary);
  const background = GUEST_BASE_PALETTE.parchment;

  // Brand-derived semantic tokens (Final Product Polish, brand color
  // propagation phase) - the ONLY two colors an organizer actually
  // chooses (Primary/Accent) are the sole input; everything below is
  // computed from them, never a new picker. "-soft" is a light,
  // background-based tint (a tinted card/pill, never raw saturated
  // color); "-foreground" is text-on-that-tint, contrast-checked against
  // the tint itself and only darkened as far as needed to clear WCAG AA
  // (see deriveAccessibleForeground) - a light custom hex never becomes
  // illegible body text, and an already-dark brand color (Forest, Dusk)
  // comes through unchanged. "-border" is the same tint family at a
  // slightly higher strength, for hairlines/dividers, not text.
  const primarySoft = deriveSoftSurface(primary, background, 0.14);
  const primaryForeground = deriveAccessibleForeground(primary, primarySoft);
  const primaryBorder = deriveSoftSurface(primary, background, 0.35);
  const secondarySoft = deriveSoftSurface(secondary, background, 0.14);
  const secondaryForeground = deriveAccessibleForeground(secondary, secondarySoft);
  const secondaryBorder = deriveSoftSurface(secondary, background, 0.35);

  // Final Brand Controls phase - Navigation/Tabs Color and App Text Color,
  // both falling back to the resolved primary when the organizer hasn't
  // set an override (so an untouched tenant looks identical to before
  // these two existed). Each is run through deriveAccessibleForeground
  // against the surface it's actually drawn on - the light app background/
  // nav bar - so a raw organizer pick that would be unreadable there is
  // automatically darkened just enough to pass WCAG AA, never rendered
  // as-is. --rbr-on-navigation is for the rarer case of navigation color
  // used as a SOLID surface (e.g. Schedule's active date pill), the same
  // "-on-" pattern as --rbr-on-primary.
  const navigation = config.customNavigation ?? primary;
  const navigationSafe = deriveAccessibleForeground(navigation, background);
  const onNavigation = safeTextColor(navigation);
  const text = config.customText ?? primary;
  const textSafe = deriveAccessibleForeground(text, background);
  // The organizer's Text color, specifically re-checked against the
  // primary-soft surface (Daily Inspiration's card background, etc.) -
  // NOT just reusing textSafe (checked against the plain parchment
  // background), because primary-soft can legitimately drift further
  // from parchment's lightness than textSafe's AA margin covers,
  // depending on how saturated/dark the organizer's Primary is. This
  // still starts from the organizer's own Text choice, not Primary -
  // only darkens further if THIS specific surface actually needs it.
  const textOnPrimarySoft = deriveAccessibleForeground(text, primarySoft);
  // A quieter version of App Text Color - for secondary/inactive UI (e.g.
  // an inactive bottom-nav tab label) that should still visibly shift
  // with the organizer's Text choice, just without competing with the
  // full-strength heading/active treatment. Blended toward the existing
  // neutral caption tone, not a fixed gray.
  const textMuted = mixHex(textSafe, GUEST_BASE_PALETTE.mist, 0.55);
  // --rbr-on-secondary mirrors --rbr-on-primary exactly, for the rarer
  // case of Accent used as a SOLID surface (e.g. an accent-toned Explore
  // tile in the alternating Primary/Accent rhythm - see explore-screen.tsx).
  const onSecondary = safeTextColor(secondary);
  // "-dark" variants: Primary/Accent blended toward the fixed near-black
  // forest neutral, reliably dark enough to hold FIXED WHITE text (no
  // per-use contrast check of its own) regardless of how light the
  // organizer's raw color is - used where fixed-white overlay text must
  // stay legible with no real photo underneath it (Explore's EntryCard
  // fallback/scrim). deriveGuaranteedDarkSurface actually verifies this
  // (contrast-checks the mix against white, darkening further if a very
  // light organizer color needs it), rather than assuming a fixed 45%
  // blend is always dark enough.
  const primaryDark = deriveGuaranteedDarkSurface(primary, GUEST_BASE_PALETTE.forest);
  const secondaryDark = deriveGuaranteedDarkSurface(secondary, GUEST_BASE_PALETTE.forest);

  return {
    "--rbr-primary": primary,
    "--rbr-secondary": secondary,
    "--rbr-on-primary": onPrimary,
    "--rbr-primary-soft": primarySoft,
    "--rbr-primary-foreground": primaryForeground,
    "--rbr-primary-border": primaryBorder,
    "--rbr-secondary-soft": secondarySoft,
    "--rbr-secondary-foreground": secondaryForeground,
    "--rbr-secondary-border": secondaryBorder,
    "--rbr-on-secondary": onSecondary,
    "--rbr-primary-dark": primaryDark,
    "--rbr-secondary-dark": secondaryDark,
    "--rbr-navigation": navigationSafe,
    "--rbr-on-navigation": onNavigation,
    "--rbr-text": textSafe,
    "--rbr-text-muted": textMuted,
    "--rbr-text-on-primary-soft": textOnPrimarySoft,
    "--rbr-background": background,
    "--rbr-surface":
      atmosphere.surfaceWarmth === "crisp" ? GUEST_BASE_PALETTE.cream : GUEST_BASE_PALETTE.parchmentDeep,
    "--rbr-radius-sm": `${8 * atmosphere.radiusScale}px`,
    "--rbr-radius-md": `${16 * atmosphere.radiusScale}px`,
    "--rbr-radius-lg": `${24 * atmosphere.radiusScale}px`,
    "--rbr-spacing-unit":
      atmosphere.spacing === "generous" ? "1.25rem" : atmosphere.spacing === "tight" ? "0.75rem" : "1rem",
    "--rbr-font-display": GUEST_FONT_DISPLAY,
    "--rbr-font-ui": GUEST_FONT_UI,
    "--rbr-parchment": GUEST_BASE_PALETTE.parchment,
    "--rbr-parchment-deep": GUEST_BASE_PALETTE.parchmentDeep,
    "--rbr-forest": GUEST_BASE_PALETTE.forest,
    "--rbr-forest-mid": GUEST_BASE_PALETTE.forestMid,
    "--rbr-sage": GUEST_BASE_PALETTE.sage,
    "--rbr-sage-pale": GUEST_BASE_PALETTE.sagePale,
    "--rbr-clay": GUEST_BASE_PALETTE.clay,
    "--rbr-clay-pale": GUEST_BASE_PALETTE.clayPale,
    "--rbr-sand": GUEST_BASE_PALETTE.sand,
    "--rbr-dusk": GUEST_BASE_PALETTE.dusk,
    "--rbr-mist": GUEST_BASE_PALETTE.mist,
    "--rbr-cream": GUEST_BASE_PALETTE.cream,
  };
}
