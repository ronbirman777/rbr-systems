import { z } from "zod";
import { imagePositionSchema } from "./imagePosition";

/**
 * "facilities" module_key - Pool, Sauna, Yoga Shala, etc. No real-time
 * status in this slice, just browsable information.
 *
 * SHORT DESCRIPTION - READ THIS BEFORE ADDING A FIELD (TASK 029, D4).
 *
 * A facility has two descriptions: a short line for its card and the full
 * text for its detail screen. They map to storage like this:
 *
 *   module_items.subtitle     -> published as `shortDescription`  (card)
 *   module_items.description  -> published as `description`       (detail)
 *
 * The short one lives in the existing `subtitle` COLUMN, not in
 * `metadata`. That is deliberate and it is the same place treatments has
 * always kept it (see treatment.ts, `shortDescription: subtitle` since
 * 0008), so the two modules stay consistent and neither needs DDL.
 *
 * So: do NOT add `metadata.shortDescription`. A facility would then have
 * two fields for one piece of content, and publish_space() only reads the
 * column - whatever went into metadata would be silently unpublished.
 * Migration 0033 emits `shortDescription` only when `subtitle` is not
 * null, which is why no existing facility gained the key.
 */
export const facilitySchema = z.object({
  name: z.string().min(1),
  /**
   * The short line for the card. Stored in the `subtitle` COLUMN - see
   * this file's header for why, and why there must never be a
   * `metadata.shortDescription` beside it.
   *
   * Defaulted, not required: every facility published before 0033 has no
   * such key, and a required field would fail the whole parse and blank
   * an existing Space's Facilities screen.
   */
  shortDescription: z.string().nullable().catch(null).default(null),
  description: z.string().nullable(),
  imageRef: z.string().nullable(),
  openingHours: z.string().nullable(),
  location: z.string().nullable(),
  importantInfo: z.string().nullable(),
  /** TASK 020 - shared focal-point contract; see meal.ts/facilitator.ts. */
  imagePosition: imagePositionSchema,
});

export type PublicFacility = z.infer<typeof facilitySchema>;
export type EditableFacility = PublicFacility & { id: string; imageUrl?: string | null };
export type DisplayFacility = PublicFacility & { imageUrl: string | null };
