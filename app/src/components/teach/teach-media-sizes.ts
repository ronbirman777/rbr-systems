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
 *
 * TASK 033: a published Teach Space no longer becomes a desktop website from
 * 640px up - it renders inside the shared desktop Guest column (at most
 * 430px, lib/guest/column.ts), where its container queries always see a
 * phone-width container. So every value is now "the phone value, evaluated
 * at the 430px column" once the column is active (from 431px, i.e. any
 * window wider than a phone), and exactly the previous phone value at or
 * below 430px (where nothing changed). The former @40rem/@4xl clauses described a
 * layout the published page no longer shows, and over-fetched for it.
 */
import { GUEST_COLUMN_MAX_WIDTH as COLUMN } from "@/lib/guest/column";
import { columnCoverSizes, fixedCoverSizes } from "@/lib/media/coverSizes";

/*
 * Guest image sharpness: every Teach image is object-fit: cover (BrandImage),
 * so each entry is HEIGHT-aware (lib/media/coverSizes.ts). A width-only
 * value made the browser pick a render sized to the box width that cover
 * then stretched to fill a taller box - the class thumbnail (76x90 fed by a
 * 16:9 photo) was upscaled about 2x at DPR 2. Each entry names its box;
 * keep the dimensions in step with the className at the call site. The
 * phone/column split is unchanged: `columnCoverSizes(columnPx, phoneVw, h)`.
 */
export const TEACH_SIZES = {
  /** Desktop top-nav avatar: `w-9 h-9` = 36x36, fixed. (Studio preview only now.) */
  navAvatar: fixedCoverSizes(36, 36),

  /** Home hero portrait, arch layout: 230x290 (`--tt-portrait: 230px`, height x 290/230). */
  heroPortraitArch: fixedCoverSizes(230, 290),

  /** Home hero portrait, circle layout: 168x168. */
  heroPortraitCircle: fixedCoverSizes(168, 168),

  /** Home hero, full-bleed layout: full width, `h-[360px]`. */
  heroFullbleed: columnCoverSizes(COLUMN, 100, 360),

  /** About Me portrait: `w-[150px] h-[150px]`, round. */
  aboutPortrait: fixedCoverSizes(150, 150),

  /** Home "More from" cards: two up on a phone (45vw, 45% of the column), `h-[110px]`. */
  homeMoreCard: columnCoverSizes(Math.round(COLUMN * 0.45), 45, 110),

  /** About gallery tiles: two up; every third tile is `h-[220px]`, the rest `h-[140px]`. */
  galleryTall: columnCoverSizes(COLUMN / 2, 50, 220),
  galleryShort: columnCoverSizes(COLUMN / 2, 50, 140),

  /** About certificate thumbnail: `w-12 h-12` = 48x48, fixed. */
  certificate: fixedCoverSizes(48, 48),

  /** Readings featured card: full width, `h-[200px]`. */
  readingFeatured: columnCoverSizes(COLUMN, 100, 200),

  /** Readings list row: `w-[78px] h-[78px]` (the @4xl tile is never reached in the column). */
  readingRow: fixedCoverSizes(78, 78),

  /** Reading detail cover: full bleed, `h-[260px]`. */
  readingCover: columnCoverSizes(COLUMN, 100, 260),

  /** Audio featured card: full bleed behind its overlay, `h-[190px]`. */
  audioFeatured: columnCoverSizes(COLUMN, 100, 190),

  /** Audio list row thumbnail: `w-16 h-16` = 64x64, fixed. */
  audioRow: fixedCoverSizes(64, 64),

  /** Audio player artwork: square, capped at 300px. */
  audioArtwork: fixedCoverSizes(300, 300),

  /** Contact (`h-[210px]`) and custom-page (`h-[240px]`) covers: full bleed; sized for the taller. */
  pageCover: columnCoverSizes(COLUMN, 100, 240),

  /** My Retreats list card: one column on a phone, `h-[180px]`. */
  retreatCard: columnCoverSizes(COLUMN, 100, 180),

  /** My Retreats detail cover: full bleed, `h-[240px]`. */
  retreatCover: columnCoverSizes(COLUMN, 100, 240),

  /** Class-card thumbnail: `w-[76px] h-[90px]`, fixed. */
  classCardThumb: fixedCoverSizes(76, 90),

  /** Explore cards: full width in the column; `h-[200px]` (tall/feature) or `h-[170px]`; sized for the taller. */
  exploreCard: columnCoverSizes(COLUMN, 100, 200),
} as const;
