import { contrastRatio, hexToRgb, mixHex, safeTextColor } from "@/lib/theme/contrast";

/**
 * Accessible colour selection for the shared Brand model.
 *
 * THE RULE THIS MODULE EXISTS TO ENFORCE: a stored brand colour is never
 * changed to make it accessible. The eight canonical presets and every
 * organizer's Custom Colour are preserved byte-for-byte in the database
 * and rendered as chosen. What this module does instead is pick an
 * accessible *foreground* to place ON those colours, and tell the
 * organizer when a pair is weak. Nothing here writes, and nothing here
 * darkens a swatch the owner approved.
 *
 * THRESHOLDS (WCAG 2.1)
 *   normal text   4.5:1   AA 1.4.3 - body copy, labels, links
 *   large text    3.0:1   AA 1.4.3 - >=24px, or >=18.66px bold
 *   non-text      3.0:1   AA 1.4.11 - icons, borders, focus rings,
 *                         and any control boundary a user must perceive
 *
 * ALGORITHM for foreground selection, in order:
 *   1. If the organizer's own colour already clears the threshold against
 *      the surface, use it unchanged. Their colour wins whenever it can.
 *   2. Otherwise pick whichever neutral endpoint - the app's light cream
 *      or its dark forest - has the higher ratio against that surface.
 *      Both endpoints are app-owned neutrals, not invented colours.
 *   3. If even the better endpoint misses the threshold, step it further
 *      from the surface (toward pure white or pure black) until it
 *      clears, so the result stays recognisably the same neutral.
 *
 * A mid-tone surface can make 4.5:1 UNREACHABLE: the best any colour can
 * do against #808080 is about 3.95:1, and several approved presets are
 * mid-tone by design. When that happens this returns the HIGHEST-contrast
 * option available rather than pretending to clear the bar. It is a
 * best-effort contract, not a guarantee - callers that need to know
 * whether the bar was actually met must ask gradeContrast, and the
 * product reports that rather than blocking anyone from publishing.
 */

export const CONTRAST_THRESHOLDS = {
  normalText: 4.5,
  largeText: 3,
  nonText: 3,
} as const;

export type ContrastLevel = keyof typeof CONTRAST_THRESHOLDS;

/** App-owned neutral endpoints. Not organizer-configurable by design. */
export const NEUTRAL_LIGHT = "#FBF9F5";
export const NEUTRAL_DARK = "#1B2E24";

export function contrastOf(aHex: string, bHex: string): number {
  return contrastRatio(hexToRgb(aHex), hexToRgb(bHex));
}

export function meetsLevel(foregroundHex: string, backgroundHex: string, level: ContrastLevel = "normalText"): boolean {
  return contrastOf(foregroundHex, backgroundHex) >= CONTRAST_THRESHOLDS[level];
}

export type ContrastGrade = {
  ratio: number;
  /** Rounded to one decimal, which is how it is shown to organizers. */
  displayRatio: string;
  level: ContrastLevel;
  threshold: number;
  /**
   * pass  clears the requested level
   * warn  clears large-text/non-text (3:1) but not normal text (4.5:1) -
   *       usable for headings and controls, risky for body copy
   * fail  below 3:1 - not usable for any text or meaningful control
   */
  grade: "pass" | "warn" | "fail";
};

/**
 * Grades a real foreground/background pair. Deliberately grades the PAIR,
 * not a swatch in isolation: a colour is not accessible or inaccessible
 * on its own, only against what it is drawn on.
 */
export function gradeContrast(
  foregroundHex: string,
  backgroundHex: string,
  level: ContrastLevel = "normalText"
): ContrastGrade {
  const ratio = contrastOf(foregroundHex, backgroundHex);
  const threshold = CONTRAST_THRESHOLDS[level];
  const grade = ratio >= threshold ? "pass" : ratio >= CONTRAST_THRESHOLDS.largeText ? "warn" : "fail";
  return { ratio, displayRatio: `${Math.round(ratio * 10) / 10}:1`, level, threshold, grade };
}

/**
 * An accessible foreground to place on `surfaceHex`.
 *
 * `preferred` is the organizer's own colour when there is one; it is
 * returned unchanged whenever it already clears the threshold, so brand
 * identity survives wherever it legitimately can.
 */
export function accessibleForeground(
  surfaceHex: string,
  options: { preferred?: string | null; level?: ContrastLevel } = {}
): string {
  const level = options.level ?? "normalText";
  const threshold = CONTRAST_THRESHOLDS[level];

  if (options.preferred && meetsLevel(options.preferred, surfaceHex, level)) {
    return options.preferred;
  }

  // Both neutral families are evaluated, never just the one that looks
  // better at first glance. On a mid-tone surface the two can disagree
  // sharply - #808080 reaches only 3.9:1 against white but 5.3:1 against
  // black - so committing to a family before checking would quietly
  // return the worse of the two.
  const candidates: string[] = [NEUTRAL_LIGHT, NEUTRAL_DARK];
  for (let step = 1; step <= 10; step++) {
    candidates.push(mixHex(NEUTRAL_LIGHT, "#FFFFFF", step / 10));
    candidates.push(mixHex(NEUTRAL_DARK, "#000000", step / 10));
  }

  let best = NEUTRAL_DARK;
  let bestRatio = 0;
  let cleared: { hex: string; ratio: number } | null = null;

  for (const candidate of candidates) {
    const ratio = contrastOf(candidate, surfaceHex);
    if (ratio > bestRatio) {
      best = candidate;
      bestRatio = ratio;
    }
    // Among candidates that clear, prefer the gentlest - the one closest
    // to an app neutral - rather than jumping straight to pure black.
    if (ratio >= threshold && (cleared === null || ratio < cleared.ratio)) {
      cleared = { hex: candidate, ratio };
    }
  }

  return cleared ? cleared.hex : best;
}

/**
 * The highest contrast ratio ANY colour can reach against this surface.
 * Lets a caller distinguish "this palette is poorly chosen" from "this
 * surface is mid-tone, so 4.5:1 is impossible for anyone".
 */
export function maxAchievableContrast(surfaceHex: string): number {
  return Math.max(contrastOf("#FFFFFF", surfaceHex), contrastOf("#000000", surfaceHex));
}

/**
 * The foreground for text on a SOLID brand surface (a filled button, a
 * nav pill). Always one of the two neutrals - a tinted foreground on a
 * saturated fill reads as a rendering bug, not as brand.
 */
export function onBrandSurface(surfaceHex: string, level: ContrastLevel = "normalText"): string {
  return accessibleForeground(surfaceHex, { level });
}

export type BrandRole = "primary" | "accent" | "navigation" | "text" | "surface";

export type RolePairReport = {
  role: BrandRole;
  /** What this pair is, in organizer language. */
  label: string;
  foreground: string;
  background: string;
} & ContrastGrade;

/**
 * Grades the pairs an organizer actually sees, for the Custom Colours
 * feedback panel. These are REAL rendered pairs (text on the app
 * background, white-or-dark text on a filled button), never two swatches
 * compared to each other for the sake of a number.
 *
 * This reports; it never blocks. Publishing stays allowed at every grade,
 * because a Space whose heading is 4.2:1 is still a Space its owner needs
 * to be able to publish.
 */
export function gradeBrandRoles(colors: {
  primary: string;
  accent?: string;
  navigation: string;
  text: string;
  surface: string;
}): RolePairReport[] {
  const { primary, navigation, text, surface } = colors;
  return [
    {
      role: "text",
      label: "Body text on the app background",
      foreground: text,
      background: surface,
      ...gradeContrast(text, surface, "normalText"),
    },
    {
      role: "primary",
      label: "Button label on a filled button",
      foreground: onBrandSurface(primary),
      background: primary,
      ...gradeContrast(onBrandSurface(primary), primary, "normalText"),
    },
    {
      role: "navigation",
      label: "Active navigation item",
      foreground: accessibleForeground(surface, { preferred: navigation, level: "largeText" }),
      background: surface,
      ...gradeContrast(accessibleForeground(surface, { preferred: navigation, level: "largeText" }), surface, "largeText"),
    },
    // Accent is deliberately NOT graded. It is used for decorative
    // dividers and soft detail, and WCAG 1.4.11 exempts purely decorative
    // elements - grading it would mark most of the approved brand as
    // failing for something that carries no information.
  ];
}

/** True when nothing in the Brand step is below the usable (3:1) floor. */
export function brandRolesAreUsable(reports: RolePairReport[]): boolean {
  return reports.every((r) => r.grade !== "fail");
}

/**
 * A light tint of a brand colour over the app surface, for a tinted card
 * or pill. Re-exported from the existing engine so brand consumers have
 * one import, not two.
 */
export { deriveSoftSurface, mixHex, safeTextColor } from "@/lib/theme/contrast";
