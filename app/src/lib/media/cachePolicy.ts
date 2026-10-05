import { parseVersionedMediaPath } from "./path";
import type { GuestAccessMode } from "@/lib/guestAccess/mode";

/**
 * How long a browser may reuse a published-media redirect, and how long
 * the signed URL it points at stays valid.
 *
 * These two numbers are a pair and must not be set independently: a
 * cached redirect that outlives its signed URL sends the guest to a
 * Storage 403, so the TTL has to exceed the cache window plus the time a
 * slow client takes to follow the redirect. 120 seconds of slack is
 * ample for that.
 *
 * The TTL is kept only as long as that arithmetic requires, and no
 * longer, because it IS the residual exposure window: an already-issued
 * signed URL cannot be revoked. If a Space that was public at issue time
 * later lapses or gains an access code, a URL handed out just before
 * keeps working until it expires. That window was 60 seconds before CP4
 * and is 7 minutes for this one case - versioned, published, and public
 * at the moment of issue, i.e. bytes the organizer had already published
 * to anyone with the link. Draft objects, legacy paths and code-protected
 * Spaces all keep the 60-second default below.
 */
export const PUBLISHED_MEDIA_CACHE_SECONDS = 300; // 5 minutes
export const PUBLISHED_MEDIA_SIGNED_TTL_SECONDS = 420; // 7 minutes: the cache window + 2 minutes of slack

/** The conservative default: no caching, shortest possible signed URL. */
export const DEFAULT_SIGNED_TTL_SECONDS = 60;

export type MediaCacheDecision = {
  cacheControl: string;
  signedTtlSeconds: number;
  /**
   * The `Vary` header to send, or null for none.
   *
   * Not a constant, because it is a factual claim about THIS response and
   * the two cases differ. Walk the route for a public Space: the
   * published_spaces lookup, the snapshot-membership check,
   * isSpacePubliclyAvailable and getGuestAccessMode all take only a
   * tenant id, and resolveGuestAccessDetailed's cookie check sits behind
   * `mode === "code" &&`, so for a public Space it is never called. No
   * cookie is read, and the answer is a pure function of (tenant,
   * object, width). Announcing `Vary: Cookie` there is simply false, and
   * it costs something: a shared cache has to keep a separate variant
   * per distinct Cookie header, which for a Space reached from the open
   * web means approximately one variant per visitor - i.e. the public
   * caching CP4 just added would never accumulate a hit.
   *
   * Everywhere else the cookie genuinely decides the outcome - the
   * code-entry gate reads the guest cookie, draft audio reads the
   * member's session - so those responses keep it. They are `no-store`
   * anyway, so it changes no cache behaviour; it states the dependency
   * correctly to any intermediary that looks.
   *
   * This cannot widen access: it only tells caches how to key a response
   * the route had already decided to serve, and the public case it
   * applies to is one where every visitor is entitled to the same bytes.
   */
  vary: string | null;
  /** Why this decision was reached - surfaced in tests and debugging. */
  reason: string;
};

const NO_STORE: Omit<MediaCacheDecision, "reason"> = {
  cacheControl: "private, no-store",
  signedTtlSeconds: DEFAULT_SIGNED_TTL_SECONDS,
  vary: "Cookie",
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
    // No cookie was read to produce this, so none is varied on. See the
    // `vary` field's own note for why that matters here.
    vary: null,
    reason: "versioned published object in a public Space: immutable, so the URL is its own version",
  };
}

/**
 * The widths /api/media will render. An allowlist rather than a free
 * number for two reasons: an attacker cannot mint unbounded distinct
 * cache entries (or unbounded Storage transform work) from one path, and
 * the set stays small enough that a CDN actually accumulates hits.
 *
 * The ladder spans the real boxes in both Guest Apps, from a 36px nav
 * avatar at 3x (108px, so the 160 rung) up to a 430px hero at 3x. The
 * two small rungs are not decoration: before CP4 gave the thumbnails a
 * `sizes`, a 36px avatar and a 48px certificate were each downloading
 * the organizer's full-resolution original, and without a rung below
 * 320 they would still be asking for roughly ten times the pixels they
 * can display - possibly MORE than the original, for a small source
 * image.
 */
export const MEDIA_WIDTHS = [96, 160, 320, 480, 640, 960, 1280, 1600] as const;
export type MediaWidth = (typeof MEDIA_WIDTHS)[number];

/** The requested width, or null when absent or not on the allowlist. */
export function parseMediaWidth(raw: string | null): MediaWidth | null {
  if (!raw) return null;
  const n = Number(raw);
  return (MEDIA_WIDTHS as readonly number[]).includes(n) ? (n as MediaWidth) : null;
}

/**
 * The width-aware candidate list for a media URL, or undefined when
 * there is nothing to choose between.
 *
 * This lives here, rather than inside BrandImage, because two callers
 * have to agree on it EXACTLY: the <img> that will eventually display
 * the image, and the background prefetcher that warms it ahead of time
 * (see lib/media/prefetch.ts). If the two built different candidate
 * lists the browser would select from different sets, the prefetch would
 * warm a URL the <img> never asks for, and the result would be two
 * downloads instead of one - the "duplicate requests" CP4 is meant to
 * remove. One function, both callers, no drift.
 *
 * It only ever parameterises a URL it was given; `w` is validated server
 * side against MEDIA_WIDTHS, so an off-ladder value cannot be smuggled
 * through here.
 */
export function mediaSrcSet(src: string, sizes?: string): string | undefined {
  if (!sizes || !src.startsWith("/api/media/")) return undefined;
  const sep = src.includes("?") ? "&" : "?";
  return MEDIA_WIDTHS.map((w) => `${src}${sep}w=${w} ${w}w`).join(", ");
}
