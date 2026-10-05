/* eslint-disable @next/next/no-img-element -- guest media is served through /api/media, which 307s to a short-lived signed URL; next/image cannot be pointed at it (see the 028D findings). */
import type { CSSProperties } from "react";
import { focalPointToObjectPosition, type FocalPoint } from "@/lib/media/focalPoint";
import { MEDIA_WIDTHS } from "@/lib/media/cachePolicy";

/**
 * The shared image presentation primitive for published Guest surfaces.
 *
 * Time to Teach had TeachImage (object-fit cover, focal point, branded
 * fallback); Time to Flow rendered bare <img> tags with an inline
 * object-position and no fallback at all, so a missing or failed image
 * left a hole. This is that behaviour extracted once, for both.
 *
 * What it deliberately does NOT change:
 *   - Media identity. It takes an already-resolved display URL; it never
 *     builds one, never sees a ref, and never touches /api/media's
 *     authorization. Published-media immutability is unaffected.
 *   - Focal points. The organizer's chosen focus is applied as
 *     object-position through the same shared helper both products
 *     already used, so no crop moves.
 *
 * Loading is caller-controlled rather than hardcoded: the hero/LCP image
 * must not be lazy, and 028D measured that as the single largest Guest
 * performance problem. `priority` opts an image into eager loading and
 * high fetch priority; everything else stays lazy.
 */
export function BrandImage({
  src,
  focal,
  alt,
  className = "",
  style,
  fallback,
  fallbackLabel,
  priority = false,
  width,
  height,
  sizes,
}: {
  /** Already-resolved display URL, or null for the fallback surface. */
  src: string | null | undefined;
  focal?: FocalPoint | null;
  alt: string;
  className?: string;
  style?: CSSProperties;
  /** CSS background for the no-image state. */
  fallback?: string;
  /** Optional large initial shown on the fallback surface. */
  fallbackLabel?: string | null;
  /** True only for an above-the-fold LCP candidate. */
  priority?: boolean;
  /** Intrinsic dimensions, when known, to reserve space and avoid shift. */
  width?: number;
  height?: number;
  /**
   * The CSS `sizes` value for this image's box. Supplying it turns on
   * width-aware delivery: the browser picks a render from the ladder
   * instead of always downloading the full-resolution original, which on
   * a phone is the difference between a few hundred KB and a few tens.
   * Omit it and behaviour is exactly as before.
   */
  sizes?: string;
}) {
  if (!src) {
    return (
      <div
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
        className={`relative overflow-hidden flex items-center justify-center ${className}`}
        style={{
          background: fallback ?? "linear-gradient(150deg, var(--rbr-primary-soft), var(--rbr-secondary-soft))",
          ...style,
        }}
      >
        {fallbackLabel ? (
          <span
            aria-hidden="true"
            style={{ fontFamily: "var(--tt-font-display, var(--rbr-font-display))", color: "var(--rbr-primary)", opacity: 0.55 }}
            className="text-3xl"
          >
            {fallbackLabel.slice(0, 1).toUpperCase()}
          </span>
        ) : null}
      </div>
    );
  }

  // Width-aware candidates, built by parameterising the URL we were
  // given rather than by constructing one: /api/media validates `w`
  // against its own allowlist and ignores anything else, so this can
  // only ever ask for a render the server already agreed to produce.
  const srcSet = sizes && src.startsWith("/api/media/")
    ? MEDIA_WIDTHS.map((w) => `${src}${src.includes("?") ? "&" : "?"}w=${w} ${w}w`).join(", ")
    : undefined;

  return (
    <img
      src={src}
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      alt={alt}
      width={width}
      height={height}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding={priority ? "sync" : "async"}
      className={`object-cover tt-fade-in ${className}`}
      style={{ objectPosition: focalPointToObjectPosition(focal), ...style }}
    />
  );
}
