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
 * 480px, lib/guest/column.ts), where its container queries always see a
 * phone-width container. So every value is now "the phone value, evaluated
 * at the 480px column" from 640px up, and exactly the previous value below
 * 640px (where nothing changed). The former @40rem/@4xl clauses described a
 * layout the published page no longer shows, and over-fetched for it.
 */
import { GUEST_COLUMN_MAX_WIDTH as COLUMN, columnSizes } from "@/lib/guest/column";

export const TEACH_SIZES = {
  /** Desktop top-nav avatar: `w-9` = 36px, fixed. (Studio preview only now.) */
  navAvatar: "36px",

  /** Home "More from" cards: two up on a phone (45vw), so 45% of the column. */
  homeMoreCard: columnSizes(Math.round(COLUMN * 0.45), "45vw"),

  /** About gallery tiles: two up, three from @xl (36rem) - never reached in the column. */
  gallery: columnSizes(COLUMN / 2, "(min-width: 576px) 33vw, 50vw"),

  /** About certificate thumbnail: `w-12` = 48px, fixed. */
  certificate: "48px",

  /** Readings featured card: full width on a phone. */
  readingFeatured: columnSizes(COLUMN, "100vw"),

  /** Readings list row: a 78px thumbnail (the @4xl tile is never reached in the column). */
  readingRow: "78px",

  /** Reading detail cover: full bleed. */
  readingCover: columnSizes(COLUMN, "100vw"),

  /** Audio featured card: full bleed behind its overlay. */
  audioFeatured: columnSizes(COLUMN, "100vw"),

  /** Audio list row thumbnail: `w-16` = 64px, fixed. */
  audioRow: "64px",

  /** Audio player artwork: capped at 300px. */
  audioArtwork: columnSizes(300, "min(300px, 100vw)"),

  /** Contact and custom-page covers: full bleed. */
  pageCover: columnSizes(COLUMN, "100vw"),

  /** My Retreats list card: one column on a phone (the two/three-up layouts are never reached in the column). */
  retreatCard: columnSizes(COLUMN, "100vw"),

  /** My Retreats detail cover: full bleed. */
  retreatCover: columnSizes(COLUMN, "100vw"),

  /** Class-card thumbnail: `w-[76px]`, fixed. */
  classCardThumb: "76px",
} as const;
