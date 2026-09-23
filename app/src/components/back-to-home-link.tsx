import Link from "next/link";

/**
 * Task 011: "Back to home" for a visitor who lands on /log-in or /sign-up
 * but doesn't want to log in or create an account. Reuses the exact
 * chevron + text visual language and touch-target sizing already
 * established for Studio's "Back to My Spaces" control
 * (retreat-configurator.tsx) - not a new pattern. A plain `<Link>` (not a
 * dirty-guarded button): these auth forms have no unsaved-draft state to
 * protect, so there is nothing here for a guard to intercept - routing
 * straight to `/` is always safe. Visible keyboard focus comes from the
 * existing site-wide `:focus-visible` rule in globals.css, unchanged.
 */
export function BackToHomeLink() {
  return (
    <Link
      href="/"
      aria-label="Back to home"
      className="inline-flex items-center gap-1 min-h-11 pl-1 pr-2.5 -ml-1 -mt-1 mb-2 rounded-lg text-idw-forest/70 hover:text-idw-forest active:bg-idw-forest/10 transition-colors"
    >
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="shrink-0">
        <path d="M12.5 15.5L7 10l5.5-5.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-sm font-semibold whitespace-nowrap">Back to home</span>
    </Link>
  );
}
