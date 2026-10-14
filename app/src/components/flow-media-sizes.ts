/**
 * The CSS box of every Time to Flow Guest image, as a `sizes` value.
 *
 * One table because the same two strings were written out in six
 * separate files, and the moment that happens they drift: CP4's browser
 * matrix caught the Today hero alone declaring `100vw`, which is true on
 * a phone and badly wrong above it - Flow renders inside a FIXED 390px
 * device frame from `sm` up, so at a 768px viewport that hero was
 * fetching a 1600px render for a 390px box.
 *
 * Also read by the background prefetcher (lib/media/prefetch.ts), which
 * has to select from the same candidate set the <img> will or the warmed
 * render is the wrong one and the visitor pays for two.
 *
 * Teach has its own table (teach/teach-media-sizes.ts) rather than
 * sharing this one: the two products have genuinely different layouts -
 * Flow is a fixed phone frame at every width, Teach is responsive - and
 * merging them would mean one set of breakpoints pretending to describe
 * both.
 */
import { GUEST_COLUMN_MAX_WIDTH } from "@/lib/guest/column";
import { columnCoverSizes, fixedCoverSizes } from "@/lib/media/coverSizes";

/*
 * TASK 033: above 430px (lib/guest/column.ts) Flow no longer sits in a 390px device frame but in
 * the shared desktop Guest column (lib/guest/column.ts, at most 430px), so
 * the boxes below are derived from that column. The code-entry screen still
 * draws its own 390px frame; asking it for a 430px box lands on the same
 * MEDIA_WIDTHS rung at 1x and 2x, so it fetches nothing extra.
 *
 * Guest image sharpness: every Flow image is object-fit: cover, so each
 * entry is HEIGHT-aware (lib/media/coverSizes.ts). Declaring only the box
 * width made the browser pick a render sized to the width that cover then
 * stretched to fill the height - the Today hero (430x280) and every short
 * card were upscaled. Each entry names its box; keep the height in step
 * with the className at the call site.
 */
const COLUMN = GUEST_COLUMN_MAX_WIDTH;
/** A full-width card/hero of the given CSS height (`h-[Npx]`). */
const frame = (heightPx: number) => columnCoverSizes(COLUMN, 100, heightPx);
/** A half-width tile (two to a row) of the given CSS height. */
const tile = (heightPx: number) => columnCoverSizes(COLUMN / 2, 50, heightPx);

export const FLOW_SIZES = {
  /** Today hero: full width, `h-[280px]`. */
  todayHero: frame(280),
  /** Guest-access gate hero: full width, `h-[220px]`. */
  accessHero: frame(220),
  /** Team card photo: full width, `h-[300px]`. */
  facilitatorCard: frame(300),
  /** Treatment card photo: full width, `h-[200px]`. */
  treatmentCard: frame(200),
  /** Meal card photo: full width, `h-[160px]`. */
  mealCard: frame(160),
  /** Facilities: the first card is `h-[220px]`, the rest `h-[160px]`. */
  facilityFeatured: frame(220),
  facilityCard: frame(160),
  /** Custom page cover: full width, `h-[180px]`. */
  customPageCover: frame(180),
  /** Readings featured card and reading detail cover: full width, `h-[200px]`. */
  readingFeatured: frame(200),
  readingCover: frame(200),
  /** Readings list thumbnail: `w-[88px]`, stretched to the row (min 88px; sized for a row up to 120px). */
  readingRow: fixedCoverSizes(88, 120),
  /** Audio list thumbnail: `w-[76px] h-[76px]`. */
  audioRow: fixedCoverSizes(76, 76),
  /** Audio player artwork: square, `max-w-[280px]`. */
  audioArtwork: fixedCoverSizes(280, 280),
  /** Explore: Meals card `h-[180px]`, Treatments card `h-[200px]`, full width. */
  exploreMeals: frame(180),
  exploreTreatments: frame(200),
  /** Explore: the half-width tiles (and compact Facilities card), `h-[140px]`. */
  exploreTile: tile(140),
} as const;

/**
 * The Today header logo: `h-6 w-auto max-w-[88px]`, so never wider than
 * 88px. Before TASK 033 it had no srcset and downloaded its full original
 * (512px) for a 24px-tall display.
 */
export const FLOW_LOGO_SIZES = "88px";
