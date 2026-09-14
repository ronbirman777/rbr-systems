/**
 * WCAG 2.1 relative luminance + contrast ratio, used to keep customer-chosen
 * primary colors safe to read against the surfaces we render text on.
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */

export type RGB = { r: number; g: number; b: number };

export function hexToRgb(hex: string): RGB {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const int = parseInt(full, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function channelLuminance(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function relativeLuminance({ r, g, b }: RGB): number {
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  );
}

export function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Picks whichever of cream (#FBF9F5) or forest (#1B2E24) text reads better
 * on a given background, per WCAG AA (>= 4.5:1 for normal text).
 */
export function safeTextColor(backgroundHex: string): "#FBF9F5" | "#1B2E24" {
  const bg = hexToRgb(backgroundHex);
  const cream = hexToRgb("#FBF9F5");
  const forest = hexToRgb("#1B2E24");
  const onCream = contrastRatio(bg, cream);
  const onForest = contrastRatio(bg, forest);
  return onCream >= onForest ? "#FBF9F5" : "#1B2E24";
}

export function meetsAA(backgroundHex: string, textHex: string): boolean {
  return contrastRatio(hexToRgb(backgroundHex), hexToRgb(textHex)) >= 4.5;
}

function rgbToHex(rgb: RGB): string {
  return `#${[rgb.r, rgb.g, rgb.b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;
}

/** Linear channel-wise blend from `fromHex` toward `toHex`, `amount` of the way (0-1). */
export function mixHex(fromHex: string, toHex: string, amount: number): string {
  const a = hexToRgb(fromHex);
  const b = hexToRgb(toHex);
  const t = Math.min(1, Math.max(0, amount));
  return rgbToHex({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t });
}

/**
 * A light tint of `colorHex` blended into `ontoHex` (typically the guest
 * app's own background) - the "soft"/pale brand surface every organizer
 * color gets (a tinted card, an active pill's background), so a
 * saturated brand color still reads as a background tone rather than a
 * jarring block of raw color. `amount` is how much of `colorHex` shows
 * through - keep this low (the default) for a surface meant to hold body
 * text; a higher amount reads more like a border/accent tint.
 */
export function deriveSoftSurface(colorHex: string, ontoHex: string, amount = 0.14): string {
  return mixHex(ontoHex, colorHex, amount);
}

/**
 * An accessible foreground for text placed on a *soft/tinted* surface
 * (see deriveSoftSurface) - distinct from safeTextColor, which picks
 * between two fixed cream/forest endpoints for text on a *solid* brand
 * surface. This instead preserves the organizer's own color exactly
 * whenever it already reads fine on the tint, and only darkens it - by
 * mixing toward `darkNeutralHex`, never by picking an unrelated color -
 * just enough to clear WCAG AA. Covers both ends the brief calls out
 * explicitly: a color that's already dark enough (e.g. Forest, Dusk)
 * comes back completely unchanged; a very light custom hex gets
 * progressively darkened until legible, never left illegible.
 */
export function deriveAccessibleForeground(colorHex: string, surfaceHex: string, darkNeutralHex = "#1B2E24"): string {
  if (meetsAA(surfaceHex, colorHex)) return colorHex;
  for (let step = 1; step <= 10; step++) {
    const candidate = mixHex(colorHex, darkNeutralHex, step / 10);
    if (meetsAA(surfaceHex, candidate)) return candidate;
  }
  return darkNeutralHex;
}

/**
 * A brand-tinted surface guaranteed dark enough to hold *fixed white* text
 * with no per-consumer contrast check of its own (e.g. a photo-fallback
 * card that always uses `text-white`, never a computed foreground) -
 * distinct from deriveAccessibleForeground, which darkens a FOREGROUND
 * color to fit a fixed background; this darkens a BACKGROUND to fit a
 * fixed foreground (white). Starts at `minAmount` toward `anchorHex` (so
 * even an already-dark organizer color still gets a *visible* brand tint,
 * not a no-op), then keeps darkening further only if that org color is
 * light enough to still fail 4.5:1 against white at that starting point -
 * e.g. a very light custom Primary. Guaranteed to terminate at
 * `anchorHex` itself in the worst case, which is dark enough on its own.
 */
export function deriveGuaranteedDarkSurface(colorHex: string, anchorHex: string, minAmount = 0.45): string {
  for (let step = Math.round(minAmount * 20); step <= 20; step++) {
    const candidate = mixHex(colorHex, anchorHex, step / 20);
    if (meetsAA(candidate, "#FFFFFF")) return candidate;
  }
  return anchorHex;
}
