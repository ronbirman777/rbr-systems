/**
 * The CSS box of every Teach Guest image, as a `sizes` value.
 *
 * Why this file exists: without `sizes`, BrandImage emits no srcset and
 * the browser downloads the organizer's full-resolution original
 * whatever the box is. CP4 found that still happening on fourteen Teach
 * call sites, including a 36px nav avatar and a 48px certificate
 * thumbnail each pulling an 800-2000px file - the single most wasteful
 * media pattern left in the Guest App.
 *
 * Two rules were followed throughout:
 *
 *   NEVER UNDER-CLAIM. A `sizes` smaller than the real box makes the
 *   browser pick a render too small for it, which is a visibly blurry
 *   image. Every value here is the true box or slightly larger, so the
 *   worst case is the behaviour we already had (a bigger render than
 *   strictly needed), never a worse-looking one.
 *
 *   FIXED BOXES ARE EXACT. A `w-9` avatar is 36px at every breakpoint,
 *   so "36px" is exactly right and lets the browser apply the device
 *   pixel ratio itself.
 *
 * The approximation that remains: Teach's layout is driven by CONTAINER
 * queries (@xl, @4xl - because the same components render both full-page
 * and inside the Studio's preview frame), and `sizes` can only express
 * VIEWPORT widths. The breakpoints below are the viewport widths those
 * containers correspond to in the published layout. In the Studio's
 * narrow preview the picked render is simply larger than needed.
 */
export const TEACH_SIZES = {
  /** Desktop top-nav avatar: `w-9` = 36px, fixed. */
  navAvatar: "36px",

  /** Home "More from" cards: two up, inside the main column. */
  homeMoreCard: "(min-width: 896px) 570px, (min-width: 640px) 330px, 45vw",

  /** About gallery tiles: two up, three from @xl. */
  gallery: "(min-width: 576px) 33vw, 50vw",

  /** About certificate thumbnail: `w-12` = 48px, fixed. */
  certificate: "48px",

  /** Readings featured card: beside its text at @4xl, full width below. */
  readingFeatured: "(min-width: 896px) 640px, 100vw",

  /** Readings list row: a 78px thumbnail, becoming a full tile at @4xl. */
  readingRow: "(min-width: 896px) 33vw, 78px",

  /** Reading detail cover: full bleed. */
  readingCover: "100vw",

  /** Audio featured card: full bleed behind its overlay. */
  audioFeatured: "100vw",

  /** Audio list row thumbnail: `w-16` = 64px, fixed. */
  audioRow: "64px",

  /** Audio player artwork: capped at 300px, a 400px column at @4xl. */
  audioArtwork: "(min-width: 896px) 400px, min(300px, 100vw)",

  /** Contact and custom-page covers: full bleed. */
  pageCover: "100vw",

  /** Class-card thumbnail: `w-[76px]`, fixed. */
  classCardThumb: "76px",
} as const;
