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
import { GUEST_COLUMN_MAX_WIDTH, columnSizes } from "@/lib/guest/column";

/*
 * Backport of TASK 033 P4 (release/033-ux-fast): from `sm` up Flow no longer
 * sits in a 390px device frame but in the shared Guest column
 * (lib/guest/column.ts, at most 430px), so the boxes below derive from it.
 */
export const FLOW_SIZES = {
  /** Full width of the shell: the viewport on a phone, the column above `sm`. */
  frame: columnSizes(GUEST_COLUMN_MAX_WIDTH, "100vw"),
  /** Half of it, for the Explore tiles that sit two to a row. */
  tile: columnSizes(GUEST_COLUMN_MAX_WIDTH / 2, "50vw"),
} as const;
