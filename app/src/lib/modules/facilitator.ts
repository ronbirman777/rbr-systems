import { z } from "zod";
import { socialLinksSchema } from "./socialLinks";

/**
 * The explicit schema for the "facilitators" module_key - name, role, bio,
 * imageRef, plus socialLinks/specialties (Product Completion phase - both
 * read from module_items.metadata, which already exists on every row;
 * see the metadata round-trip discipline in actions.ts's saveFacilitators
 * - every save must carry the FULL metadata object, never a partial one,
 * or one field silently wipes the other on the next save).
 */
export const facilitatorSchema = z.object({
  name: z.string().min(1),
  role: z.string().nullable(),
  bio: z.string().nullable(),
  /** Durable Storage path (tenant-media bucket), e.g. "{tenantId}/facilitators/{itemId}.jpg" - never a temporary browser blob/object URL. */
  imageRef: z.string().nullable(),
  /** Tenant-authored tags, no fixed taxonomy - e.g. "Vinyasa Flow", "Sound Healing".
   * .default([]) is load-bearing for backward compatibility: a
   * published_spaces snapshot written before this field existed has no
   * "specialties" key at all - without the default, parsing an old
   * snapshot's facilitators array would fail entirely (zod rejects a
   * missing required field), silently breaking an already-published,
   * unrelated tenant's Team screen the moment this code ships. */
  specialties: z.array(z.string().min(1)).default([]),
  socialLinks: socialLinksSchema.default([]),
  /** Focal point as percentages (0-100) of the photo, used for CSS
   * `object-position` wherever this photo is shown with `object-fit: cover`
   * - draft-side only for now (module_items.metadata, no migration
   * needed). null/absent means "use the existing default" (object-top),
   * preserving today's look for every facilitator that hasn't set one.
   * NOT yet carried into the published snapshot - publish_space() would
   * need a small update to copy this through; see the Final Product
   * Polish report for the proposed (not-yet-applied) change. */
  imagePosition: z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) }).nullable().default(null),
});

export type PublicFacilitator = z.infer<typeof facilitatorSchema>;
export type EditableFacilitator = PublicFacilitator & {
  id: string;
  /** Client-only, resolved display URL (signed URL in the configurator, /api/media in the guest app) - never persisted, always derived from imageRef. */
  imageUrl?: string | null;
};
/** What every renderer actually needs to draw a facilitator - imageRef plus its resolved, display-ready URL. */
export type DisplayFacilitator = PublicFacilitator & { imageUrl: string | null };
