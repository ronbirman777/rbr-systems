import { parseVersionedMediaPath } from "./path";
import type { GuestAccessMode } from "@/lib/guestAccess/mode";

/**
 * How long a browser may reuse a published-media redirect, and how long
 * the signed URL it points at stays valid.
 *
 * These two numbers are a pair and must not be set independently: a
 * cached redirect that outlives its signed URL sends the guest to a
 * Storage 403. The signed TTL is therefore comfortably longer than the
 * cache window, so a redirect served at the very end of its cache life
 * still resolves.
 */
export const PUBLISHED_MEDIA_CACHE_SECONDS = 300; // 5 minutes
export const PUBLISHED_MEDIA_SIGNED_TTL_SECONDS = 900; // 15 minutes

/** The conservative default: no caching, shortest possible signed URL. */
export const DEFAULT_SIGNED_TTL_SECONDS = 60;

export type MediaCacheDecision = {
  cacheControl: string;
  signedTtlSeconds: number;
  /** Why this decision was reached - surfaced in tests and debugging. */
  reason: string;
};

const NO_STORE: Omit<MediaCacheDecision, "reason"> = {
  cacheControl: "private, no-store",
  signedTtlSeconds: DEFAULT_SIGNED_TTL_SECONDS,
};

/**
 * Whether THIS media response may be cached, and for how long.
 *
 * The whole policy turns on one property the publish pipeline already
 * guarantees (see copyDraftToPublished): a VERSIONED published object
 * `{tenant}/{module}/{item}/{uploadId}/published.<ext>` is created once
 * and never rewritten. Replacing an image produces a new uploadId and
 * therefore a NEW path, so the URL is its own version and a stale image
 * is impossible - the cache key changes the moment the content does.
 *
 * Everything that lacks that guarantee is excluded, deliberately:
 *
 *   LEGACY paths (`{tenant}/{module}/{item}/published.<ext>`, no uploadId)
 *     are overwritten IN PLACE by the legacy publish branch. Their bytes
 *     can change under a stable URL, which is exactly the "guests see a
 *     stale image after publish" failure, so they stay uncacheable.
 *
 *   DRAFT objects are never cacheable. They are private to the Studio,
 *     mutable, and must not sit in any cache.
 *
 *   CODE-PROTECTED Spaces are not publicly cacheable even when this
 *     request holds a valid cookie: the response is specific to that
 *     visitor, and the organizer can revoke the code. Caching it would
 *     keep serving images to a visitor whose access has been withdrawn.
 *     These Spaces keep today's behaviour exactly.
 *
 * Nothing here grants access. It runs only AFTER the route has already
 * decided the request may see this object, and it only chooses headers -
 * so a mistake here can slow things down or shorten a cache, but cannot
 * let anyone see something they were not already entitled to see.
 */
export function mediaCacheDecision(opts: {
  objectPath: string;
  accessMode: GuestAccessMode;
}): MediaCacheDecision {
  const versioned = parseVersionedMediaPath(opts.objectPath);

  if (!versioned) {
    return { ...NO_STORE, reason: "legacy or unversioned path: bytes can change under a stable URL" };
  }
  if (versioned.kind !== "published") {
    return { ...NO_STORE, reason: "draft object: private to the Studio and mutable" };
  }
  if (opts.accessMode === "code") {
    return { ...NO_STORE, reason: "code-protected Space: response is visitor-specific and revocable" };
  }

  return {
    cacheControl: `public, max-age=${PUBLISHED_MEDIA_CACHE_SECONDS}, immutable`,
    signedTtlSeconds: PUBLISHED_MEDIA_SIGNED_TTL_SECONDS,
    reason: "versioned published object in a public Space: immutable, so the URL is its own version",
  };
}

/**
 * The widths /api/media will render. An allowlist rather than a free
 * number for two reasons: an attacker cannot mint unbounded distinct
 * cache entries (or unbounded Storage transform work) from one path, and
 * the set stays small enough that a CDN actually accumulates hits.
 *
 * The ladder covers a 320px card at 1x through a 430px hero at 3x.
 */
export const MEDIA_WIDTHS = [320, 480, 640, 960, 1280, 1600] as const;
export type MediaWidth = (typeof MEDIA_WIDTHS)[number];

/** The requested width, or null when absent or not on the allowlist. */
export function parseMediaWidth(raw: string | null): MediaWidth | null {
  if (!raw) return null;
  const n = Number(raw);
  return (MEDIA_WIDTHS as readonly number[]).includes(n) ? (n as MediaWidth) : null;
}
