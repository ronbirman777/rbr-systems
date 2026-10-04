/**
 * Temporary master-password gate for the whole InnerDweS platform during
 * development/review - entirely separate from Supabase/customer auth,
 * which continues to work normally once past this gate.
 *
 * Disabling this feature for public launch requires zero code changes:
 * just unset INNERDWES_PREVIEW_PASSWORD in the deployment environment.
 * proxy.ts checks this at request time and no-ops the whole gate when unset.
 */
export const PREVIEW_COOKIE_NAME = "idw_preview_access";
export const PREVIEW_GATE_PATH = "/preview-access";
export const PREVIEW_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export function isPreviewGateEnabled(): boolean {
  return !!process.env.INNERDWES_PREVIEW_PASSWORD;
}

/**
 * The one carve-out from the site-wide gate: a PUBLISHED Guest App and the
 * assets it needs to render.
 *
 * A published Space is a public address a teacher hands to their students
 * and shares in a message - it cannot sit behind an InnerDweS staff
 * password. Everything else the gate protects (marketing, Studio,
 * configurator, auth, dashboards) stays gated exactly as before.
 *
 * Path-based, never user-agent based: the same bytes are served to a
 * person and to WhatsApp's crawler. A crawler-only bypass would be both a
 * lie to the visitor and trivially spoofable.
 *
 * This grants no data of its own. Each exempted route still applies its
 * own authorization, which is the real boundary:
 *   /s/<slug>, /g/<id>  published_spaces only; an unpublished Space has no
 *                       row and 404s, and a code-protected one still shows
 *                       the access-code screen. Includes the generated
 *                       social image at /s/<slug>/social/<version>.
 *   /api/media/<ref>    serves a ref only when the Space genuinely
 *                       publishes it AND this request may see that Space;
 *                       draft audio additionally needs an owner session.
 * Without the media exemption a public Guest App would render with every
 * image broken, so it is required, not a convenience.
 *
 * Deliberately NOT exempt, and each would be a real leak: /space,
 * /configurator/*, /create, /api/qr/*, /api/share-card/* (organizer-only,
 * they expose a Space before it is published) and every auth route.
 */
export function isPublicGuestPath(pathname: string): boolean {
  // A dot segment can only appear here if something upstream failed to
  // normalise the URL; never let one walk out of the public prefixes.
  if (pathname.split("/").includes("..")) return false;

  return (
    hasSegmentAfter(pathname, "/s/") ||
    hasSegmentAfter(pathname, "/g/") ||
    hasSegmentAfter(pathname, "/api/media/")
  );
}

/** True when `pathname` starts with `prefix` AND addresses something under it. */
function hasSegmentAfter(pathname: string, prefix: string): boolean {
  return pathname.startsWith(prefix) && pathname.length > prefix.length;
}
