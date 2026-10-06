import { z } from "zod";
import { optionalFocalPointSchema } from "@/lib/media/focalPoint";
import { isoDateString, optText } from "./fields";

/**
 * The Readings and Audio content layer, shared by Time to Teach and Time
 * to Flow.
 *
 * WHY THIS FILE EXISTS. Both products offer a guest the same two things -
 * a set of short written pieces, and a set of listenable tracks - and the
 * stored shape of each was already product-neutral when Teach wrote it.
 * Duplicating it for Flow would mean two caps on `excerpt`, two
 * definitions of "how many minutes is this to read", two category
 * filters. They would not stay identical.
 *
 * WHAT IS NOT SHARED, deliberately:
 *
 *   THE module_key. Teach stores under `teachReadings` / `teachAudio` and
 *     Flow will store under `readings` / `audio`. Those are live keys in
 *     published snapshots and in module_items rows; renaming either would
 *     be a data migration for no user-visible gain, so the key stays a
 *     product's business and only the SHAPE is shared.
 *
 *   THE audio note's field name. Teach stores `teacherNote` - a note from
 *     the teacher to the student. Flow's equivalent is a note about the
 *     track and will be stored as `note`. Same reasoning: the Teach key is
 *     live data. `audioNote()` below reads either, which is how a shared
 *     player stays unaware of the difference.
 *
 * Hence the audio side exports FIELDS rather than a finished object
 * schema: each product assembles its own `z.object` from them, in its own
 * key order, with its own name for the note. Assembling from shared fields
 * is what keeps the validation identical; it is only the envelope that
 * differs.
 *
 * Readings have no such divergence, so they do get a finished schema.
 */

// ---------------------------------------------------------------------------
// Readings
// ---------------------------------------------------------------------------

/**
 * One reading's metadata. The body itself is the module_item's
 * `description`, not a metadata field - that is where both products
 * already keep long text, and it is what `readingMinutes()` measures.
 */
export const readingMetadataSchema = z.object({
  excerpt: optText(500),
  category: optText(60),
  author: optText(100),
  date: isoDateString.nullable().catch(null).default(null),
  imagePosition: optionalFocalPointSchema,
});
export type ReadingMetadata = z.infer<typeof readingMetadataSchema>;

/** Average adult silent-reading speed, rounded to something defensible. */
export const READING_WORDS_PER_MINUTE = 200;

/**
 * Below this, a "1 min read" badge is noise rather than information - a
 * two-line blessing is not a one-minute read - so short pieces get no
 * estimate at all.
 */
export const READING_MINUTES_MIN_WORDS = 40;

/** "4 min read", or null when the piece is too short to be worth estimating. */
export function readingMinutes(body: string | null | undefined): number | null {
  const words = (body ?? "").trim().split(/\s+/).filter(Boolean).length;
  return words > READING_MINUTES_MIN_WORDS ? Math.max(1, Math.round(words / READING_WORDS_PER_MINUTE)) : null;
}

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------

/**
 * The fields an audio item's metadata is built from, minus the note (see
 * the file header). A zod schema instance is immutable, so sharing one
 * between two products' objects is safe.
 */
export const audioItemFields = {
  /** A versioned media path; `.catch(null)` so one bad ref cannot fail the item. */
  audioRef: z.string().max(400).nullable().catch(null).default(null),
  /** Detected at upload. Capped at 12h, which no retreat track will reach. */
  durationSeconds: z.number().min(0).max(60 * 60 * 12).nullable().catch(null).default(null),
  category: optText(60),
  imagePosition: optionalFocalPointSchema,
} as const;

/** The note shown under the player. Named per product; see `audioNote()`. */
export const audioNoteField = optText(800);

/**
 * The note on an audio item, whichever key the product stored it under.
 *
 * This is the whole of D7's "map product storage appropriately": Teach's
 * live rows say `teacherNote` and keep saying it, Flow's will say `note`,
 * and a shared player asks this function instead of either. Reading both
 * costs nothing and migrates nothing.
 */
export function audioNote(metadata: { note?: string | null; teacherNote?: string | null }): string | null {
  return metadata.note ?? metadata.teacherNote ?? null;
}

// ---------------------------------------------------------------------------
// Selectors shared by both list screens
// ---------------------------------------------------------------------------

/**
 * The distinct categories present, in first-appearance order, for the
 * filter chips. Order follows the list it is given - so a date-sorted
 * reading list yields newest-category-first - which is why this takes the
 * already-ordered array rather than sorting anything itself.
 */
export function itemCategories<T extends { metadata: { category: string | null } }>(items: readonly T[]): string[] {
  return [...new Set(items.map((i) => i.metadata.category).filter((c): c is string => Boolean(c)))];
}

/**
 * Newest first, undated last.
 *
 * `localeCompare` on two "YYYY-MM-DD" strings is an ordinary lexicographic
 * comparison, which for that format is the same as comparing the dates -
 * and a missing date becomes "", which sorts below every real date. Copied
 * rather than sorted in place: the caller's array is usually props.
 */
export function sortByDateDesc<T extends { metadata: { date: string | null } }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => (b.metadata.date ?? "").localeCompare(a.metadata.date ?? ""));
}
