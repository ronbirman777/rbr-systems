/**
 * TASK 033 - the geometry of the shared desktop Guest column
 * (components/guest/guest-desktop-shell.tsx, styled in globals.css).
 *
 * Kept in a dependency-free module so media `sizes` tables can derive from
 * it without importing a component.
 */

/** The column's maximum width (the largest current phone). Mirrors globals.css. */
export const GUEST_COLUMN_MAX_WIDTH = 430;
/**
 * Viewport width from which the column (and the backdrop) appear: the first
 * width wider than the column itself, so there is no band in which the app is
 * wider than 430px (owner rule: the mobile-app shell on every device).
 * Mirrors globals.css.
 */
export const GUEST_COLUMN_MIN_VIEWPORT = GUEST_COLUMN_MAX_WIDTH + 1;
/** The media condition under which the column is active, for `sizes` strings. */
export const GUEST_COLUMN_MEDIA = `(min-width: ${GUEST_COLUMN_MIN_VIEWPORT}px)`;

/**
 * A responsive `sizes` value for an image inside the column: `columnPx` once
 * the column is active, otherwise the caller's phone value unchanged.
 */
export function columnSizes(columnPx: number, phone: string): string {
  return `${GUEST_COLUMN_MEDIA} ${columnPx}px, ${phone}`;
}
