import type { Direction, Locale } from "./locales";
import { directionOf } from "./locales";

/**
 * Direction helpers.
 *
 * THE ICON RULE, stated once so it is not re-decided per component:
 * mirror an icon only when it means "that way". A back arrow in Hebrew
 * points right because "back" is rightwards there. A play button does
 * not, because ▶ means "play", not "rightwards" - and mirroring it
 * produces a rewind button. Same for pause, heart, microphone, calendar,
 * location pin, QR and settings.
 *
 * Hence an explicit allowlist rather than a blanket transform: a new
 * icon is non-directional until someone decides otherwise, which is the
 * safe default.
 */

/** Icons whose meaning is a direction, and which therefore mirror in RTL. */
export const DIRECTIONAL_ICONS = [
  "chevronLeft",
  "chevronRight",
  "arrowLeft",
  "arrowRight",
  "back",
  "forward",
  "next",
  "previous",
] as const;

export type DirectionalIcon = (typeof DIRECTIONAL_ICONS)[number];

export function isDirectionalIcon(name: string): name is DirectionalIcon {
  return (DIRECTIONAL_ICONS as readonly string[]).includes(name);
}

/**
 * The transform for an icon in a given direction: horizontal flip for a
 * directional icon in RTL, nothing otherwise.
 */
export function iconTransform(name: string, dir: Direction): string | undefined {
  return dir === "rtl" && isDirectionalIcon(name) ? "scaleX(-1)" : undefined;
}

/**
 * Attributes for a container of USER-AUTHORED text.
 *
 * `dir="auto"` lets the browser pick direction from the text's own first
 * strong character, which is the only correct answer: a Hebrew biography
 * inside an English Studio must read right-to-left, and an English class
 * description inside a Hebrew Guest App must read left-to-right. Forcing
 * either to inherit the app direction mangles it.
 *
 * Use on anything an organizer typed. Never on system UI, which follows
 * the Space locale.
 */
export const userContentDir = { dir: "auto" as const };

/**
 * Attributes for the app shell - system UI follows the Space locale.
 */
export function localeDirAttributes(locale: Locale): { lang: Locale; dir: Direction } {
  return { lang: locale, dir: directionOf(locale) };
}
