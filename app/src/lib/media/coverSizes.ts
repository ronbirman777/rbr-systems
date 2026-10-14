/**
 * Height-aware `sizes` values for object-fit: cover images.
 *
 * Every Guest image goes through BrandImage, which is ALWAYS
 * `object-fit: cover`. A cover image is scaled until it fills BOTH
 * dimensions of its box, so the width the browser actually has to paint
 * is not the box width but
 *
 *     max(boxWidth, boxHeight x sourceAspect)
 *
 * The previous tables declared only the box width. For a box that is
 * taller than the source's aspect (a 230x290 portrait arch or a 76x90
 * class thumbnail fed by a 16:9 photo, a 430x280 hero) the browser picked
 * a render sized to the width and cover then stretched it to fill the
 * height: measured on Production, a 2.2x upscale on the Teach portrait at
 * DPR 2, which is the blur organizers reported.
 *
 * The source aspect is not known when `sizes` is written (the value is
 * static, shared with the background prefetcher, and must not depend on
 * the image), so a conservative LANDSCAPE aspect is assumed: 16:9, the
 * shape of almost every organizer upload (camera and phone landscapes,
 * the demo photos are 1376x768 = 1.79). For a portrait or square source
 * the width term dominates and the claim is merely a little generous;
 * for a source wider than 16:9 (a panorama) the residual shortfall is
 * the ratio of the two aspects, far below the 2x it replaces.
 *
 * Failure mode is safe by construction: if a browser ever failed to parse
 * `max()` in `sizes`, the whole attribute is invalid and the browser
 * falls back to `100vw` - a larger render, never a blurrier one.
 */
import { GUEST_COLUMN_MAX_WIDTH, GUEST_COLUMN_MEDIA } from "@/lib/guest/column";

/** The source aspect assumed for every cover-cropped Guest image (width / height). */
export const COVER_SOURCE_ASPECT = 16 / 9;

/** CSS px a cover image needs to paint a `boxW` x `boxH` box sharply (before DPR). */
export function coverWidthPx(boxW: number, boxH: number, aspect: number = COVER_SOURCE_ASPECT): number {
  return Math.ceil(Math.max(boxW, boxH * aspect));
}

/** `sizes` for a box that is the same fixed size at every viewport (thumbnails, avatars, portraits). */
export function fixedCoverSizes(boxW: number, boxH: number): string {
  return `${coverWidthPx(boxW, boxH)}px`;
}

/**
 * `sizes` for a fixed-HEIGHT box whose width follows the Guest shell:
 * `columnPx` wide once the column is active (lib/guest/column.ts), and
 * `phoneVw` percent of the viewport below it.
 *
 * Below the column breakpoint the viewport is at most the column width,
 * so when the height term alone already exceeds the widest possible phone
 * box the phone clause collapses to a constant and no `max()` is needed.
 */
export function columnCoverSizes(columnPx: number, phoneVw: number, heightPx: number): string {
  const heightTerm = Math.ceil(heightPx * COVER_SOURCE_ASPECT);
  const column = Math.max(columnPx, heightTerm);
  const widestPhoneBox = Math.ceil((GUEST_COLUMN_MAX_WIDTH * phoneVw) / 100);
  const phone = heightTerm >= widestPhoneBox ? `${heightTerm}px` : `max(${phoneVw}vw, ${heightTerm}px)`;
  return phone === `${column}px` ? phone : `${GUEST_COLUMN_MEDIA} ${column}px, ${phone}`;
}
