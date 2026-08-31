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
