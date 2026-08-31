import { ATMOSPHERES, PALETTES, type BrandConfig } from "./tokens";
import { safeTextColor } from "./contrast";

/**
 * Turns a validated BrandConfig into concrete CSS custom properties.
 * This is the ONLY path from customer input to rendered style - there is no
 * custom CSS, HTML, or JS input surface anywhere in the configurator.
 */
export function deriveThemeVars(config: BrandConfig): Record<string, string> {
  const palette = PALETTES[config.palette];
  const atmosphere = ATMOSPHERES[config.atmosphere];
  const primary = config.customPrimary ?? palette.primary;
  const onPrimary = safeTextColor(primary);

  return {
    "--rbr-primary": primary,
    "--rbr-secondary": palette.secondary,
    "--rbr-on-primary": onPrimary,
    "--rbr-background": "#FBF9F5",
    "--rbr-surface": atmosphere.surfaceWarmth === "crisp" ? "#FFFFFF" : "#F4F6F3",
    "--rbr-radius-sm": `${8 * atmosphere.radiusScale}px`,
    "--rbr-radius-md": `${16 * atmosphere.radiusScale}px`,
    "--rbr-radius-lg": `${24 * atmosphere.radiusScale}px`,
    "--rbr-spacing-unit":
      atmosphere.spacing === "generous" ? "1.25rem" : atmosphere.spacing === "tight" ? "0.75rem" : "1rem",
  };
}
