"use client";

import { useState } from "react";
import { objectPositionStyle, type ImagePosition } from "@/lib/modules/imagePosition";

/**
 * The Space Image's one shared rendering surface - Manual QA Fixes phase.
 * Deliberately its own small component (not inlined into My Spaces' card
 * markup) so the same "real image, or a premium branded fallback, never a
 * broken/empty image" treatment can be reused as-is by the upcoming
 * Share / QR / "Featured on InnerDweS" surfaces, which all need the exact
 * same Space-identity thumbnail, not a redesigned one per surface.
 *
 * The fallback is InnerDweS's own fixed platform brand (not the tenant's
 * dynamic Guest App colors) - this renders in Studio/account chrome,
 * which has always been InnerDweS-branded, never tenant-themed (the
 * tenant's own color system is exclusively for their Guest App - see the
 * brand/platform token-architecture plan).
 *
 * TASK 031 (W2):
 *  - `focal` is the focal point of the image actually shown, so a face in
 *    the upper third is not cropped away by a centred object-fit.
 *  - `size` states the CSS box in pixels. With it the browser reserves the
 *    space before the bytes arrive (no layout shift) and never has to guess
 *    whether to upscale; the box itself stays the caller's className.
 *  - The image sits on the same brand gradient the fallback uses, so while
 *    it loads (or if it is slow) the card shows the brand surface rather
 *    than an empty hole.
 *  - If the image fails to load - an expired signed URL, a deleted object -
 *    the card quietly becomes the fallback instead of a broken-image icon.
 */
const FALLBACK_BACKGROUND = "linear-gradient(160deg, #192B21, #3E5C4B)";

export function SpaceThumbnail({
  imageUrl,
  alt,
  className = "",
  focal = null,
  size,
}: {
  imageUrl: string | null;
  alt: string;
  className?: string;
  focal?: ImagePosition | null;
  size?: number;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (imageUrl && failedUrl !== imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={alt}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        onError={() => setFailedUrl(imageUrl)}
        className={`object-cover ${className}`}
        style={{ background: FALLBACK_BACKGROUND, objectPosition: objectPositionStyle(focal) }}
      />
    );
  }
  return (
    <div
      className={`flex items-center justify-center ${className}`}
      style={{ background: FALLBACK_BACKGROUND }}
      aria-hidden="true"
      role="img"
      aria-label={alt}
    >
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#EBE1D5" strokeWidth="1.4">
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12.5l2.5 2.5L16 9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
