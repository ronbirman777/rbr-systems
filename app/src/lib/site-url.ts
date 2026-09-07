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
