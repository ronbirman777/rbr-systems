/**
 * TASK 033 - the geometry of the shared desktop Guest column
 * (components/guest/guest-desktop-shell.tsx, styled in globals.css).
 *
 * Kept in a dependency-free module so media `sizes` tables can derive from
 * it without importing a component.
 */

/** Viewport width from which the column (and the backdrop) appear. Mirrors globals.css. */
export const GUEST_COLUMN_MIN_VIEWPORT = 640;
/** The column's maximum width from that breakpoint up. Mirrors globals.css. */
export const GUEST_COLUMN_MAX_WIDTH = 430;
/** The media condition under which the column is active, for `sizes` strings. */
export const GUEST_COLUMN_MEDIA = `(min-width: ${GUEST_COLUMN_MIN_VIEWPORT}px)`;

/**
 * A responsive `sizes` value for an image inside the column: `columnPx` once
 * the column is active, otherwise the caller's phone value unchanged.
 */
export function columnSizes(columnPx: number, phone: string): string {
  return `${GUEST_COLUMN_MEDIA} ${columnPx}px, ${phone}`;
}
