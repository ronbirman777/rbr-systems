/**
 * The app's own public origin, used for building links that leave the app
 * entirely (email confirmation links) - these can't be derived from the
 * incoming request the way an in-app redirect can, since the email is
 * opened somewhere else. Must be set to the real production domain before
 * launch; falls back to localhost for development only.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
