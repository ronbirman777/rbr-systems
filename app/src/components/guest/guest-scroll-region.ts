/**
 * QA finding O10 - axe `scrollable-region-focusable`.
 *
 * Every Flow Guest screen scrolls inside its own `overflow-y-auto` box
 * (the page itself never scrolls - the shell is `h-dvh overflow-hidden`).
 * A screen with no focusable child (Guidelines, Facilities without a
 * "Read more", a plain custom page) left keyboard-only guests no way to
 * scroll it. Making the box itself a named, focusable region fixes that:
 * Tab lands on it, and arrow keys / PageDown / Space scroll it natively.
 *
 * Presentation/a11y only - no layout, data or behaviour change. The name
 * is the screen's own title string, already in every dictionary. The
 * focus ring is drawn by `.guest-scroll-region:focus-visible` in
 * globals.css: inset (the shell clips anything outside the box) and in
 * the Space's primary colour, keyboard focus only.
 */
export const GUEST_SCROLL_REGION_CLASS = "guest-scroll-region";

export function guestScrollRegion(label: string, { landmark = true }: { landmark?: boolean } = {}) {
  return {
    tabIndex: 0,
    "aria-label": label,
    ...(landmark ? { role: "region" as const } : null),
  };
}
