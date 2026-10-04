/**
 * The app's public origins, used for building links that leave the app
 * entirely (email confirmation links, sitemap/robots/OG metadata) - these
 * can't be derived from the incoming request the way an in-app redirect
 * can, since e.g. an email is opened somewhere else entirely.
 *
 * Domain Phase 2 splits this into two, deliberately not one shared
 * constant: the target architecture puts marketing on the apex
 * (innerdwes.com) and the organizer-facing Studio (sign-up, log-in,
 * /auth/confirm, the configurator) on app.innerdwes.com - a single
 * SITE_URL used for both would silently point one of the two at the
 * wrong domain the moment they're different hosts. Both fall back to
 * localhost for development, where there's only one origin anyway.
 */

/** Marketing/canonical origin - metadataBase, sitemap.ts, robots.ts. Set
 * NEXT_PUBLIC_SITE_URL to https://innerdwes.com at cutover. */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

/** Studio origin - auth email links (signUp/resendConfirmationEmail's
 * emailRedirectTo). Set NEXT_PUBLIC_APP_URL to https://app.innerdwes.com
 * at cutover; until then it falls back to SITE_URL so nothing breaks
 * before that env var exists. */
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || SITE_URL;

/**
 * The origin guests are actually sent to - the public Guest App address
 * that goes into a QR code, a Copy Link, a WhatsApp share, og:url and the
 * canonical tag. Separate from APP_URL (the Studio/organizer origin)
 * because a shared link must be the public one: innerdwes.com/s/<slug>,
 * not app.innerdwes.com/s/<slug>. Both hosts serve /s/[slug] identically,
 * so this is a presentation choice, not a routing one.
 *
 * Set NEXT_PUBLIC_GUEST_URL to pin it explicitly. Without it this falls
 * back to SITE_URL (the marketing/canonical apex), which is what the
 * domain cutover already points at innerdwes.com.
 */
export const GUEST_PUBLIC_ORIGIN = process.env.NEXT_PUBLIC_GUEST_URL || SITE_URL;
