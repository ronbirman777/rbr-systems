import { ImageResponse } from "next/og";
import { INNERDWES_BRAND } from "@/lib/brand/platform";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/**
 * Branded favicon, generated from the same InnerDweS mark geometry as
 * src/components/brand/wordmark.tsx (not a new logo) - a parchment ground,
 * the Forest ring with its threshold opening, the Clay arc, and the offset
 * Clay dot. Stroke width is bumped up from the wordmark's default (6 of 100
 * units) to 11 here specifically so the ring stays legible at 16-32px
 * browser-tab size; raw circumference-based dasharray values are used
 * instead of the `pathLength` attribute the wordmark component relies on,
 * since this renders through Satori/resvg (next/og), not a browser engine,
 * and raw units are the more universally supported form there.
 */
export default function Icon() {
  return new ImageResponse(
    (
      <svg width="32" height="32" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <circle cx="50" cy="50" r="48" fill={INNERDWES_BRAND.parchment} />
        <circle
          cx="50"
          cy="50"
          r="36"
          fill="none"
          stroke={INNERDWES_BRAND.forest}
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray="199.05 27.14"
          transform="rotate(111.6 50 50)"
        />
        <circle
          cx="50"
          cy="50"
          r="36"
          fill="none"
          stroke={INNERDWES_BRAND.clay}
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray="11.31 214.88"
          transform="rotate(81 50 50)"
        />
        <circle cx="64" cy="36" r="6.5" fill={INNERDWES_BRAND.clay} />
      </svg>
    ),
    { ...size }
  );
}
