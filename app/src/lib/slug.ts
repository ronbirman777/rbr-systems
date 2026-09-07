/**
 * Space public-address (subdomain slug) rules. This is the client-side
 * mirror of the database's actual enforcement (see
 * supabase/migrations/0010_self_service_spaces.sql: tenants_slug_format
 * check constraint, reserved_slugs table + trigger, and the partial
 * unique index) - it exists only so the UI can reject an invalid or
 * reserved slug instantly, without a round trip. The database is the
 * real authority: nothing here can make an insert/update succeed that the
 * schema would reject, and nothing here is what prevents two people from
 * claiming the same slug at once (the unique index does that).
 */

export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 63;

/**
 * Keep in sync with the `reserved_slugs` seed rows in migrations 0010 and
 * 0012 (0012 adds "smtp" only - see the Domain Phase 2 report for why).
 */
export const RESERVED_SLUGS = new Set([
  "www",
  "app",
  "admin",
  "api",
  "auth",
  "login",
  "log-in",
  "signup",
  "sign-up",
  "support",
  "help",
  "mail",
  "smtp",
  "preview",
  "staging",
  "dashboard",
  "studio",
  "innerdwes",
  "create",
  "space",
  "configurator",
  "g",
  "s",
  "static",
  "assets",
  "cdn",
]);

const SLUG_FORMAT = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

/**
 * Normalizes free-typed text ("Samadhi Retreat") into a slug candidate
 * ("samadhi-retreat"): lowercase, whitespace/underscore runs collapsed to
 * a single hyphen, anything else hostname-unsafe stripped, repeated
 * hyphens collapsed, leading/trailing hyphens trimmed. Purely a UX
 * convenience - the result still has to pass isValidSlugFormat.
 */
export function normalizeSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type SlugFormatError = "too_short" | "too_long" | "invalid_characters";

/** Returns null when valid, or the specific reason it isn't. */
export function slugFormatError(slug: string): SlugFormatError | null {
  if (slug.length < SLUG_MIN_LENGTH) return "too_short";
  if (slug.length > SLUG_MAX_LENGTH) return "too_long";
  if (!SLUG_FORMAT.test(slug)) return "invalid_characters";
  return null;
}

export function isValidSlugFormat(slug: string): boolean {
  return slugFormatError(slug) === null;
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}

export type SlugCheckResult = "invalid" | "reserved" | "ok";

/** Client-side pre-check only - see file header. */
export function checkSlugLocally(rawInput: string): SlugCheckResult {
  const slug = normalizeSlug(rawInput);
  if (!isValidSlugFormat(slug)) return "invalid";
  if (isReservedSlug(slug)) return "reserved";
  return "ok";
}
