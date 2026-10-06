import { z } from "zod";
import { socialLinksSchema } from "./socialLinks";
import { imagePositionSchema } from "./imagePosition";

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
  /** The short bio: the one shown on the card. Unchanged meaning. */
  bio: z.string().nullable(),
  /**
   * TASK 029 (D5): the full text, for the facilitator's own detail
   * screen. Optional and defaulted for the same backward-compatibility
   * reason as `specialties` below - an older published snapshot has no
   * such key, and a required field would fail the whole array's parse.
   * Stored in module_items.metadata, so no DDL.
   */
  longBio: z.string().nullable().catch(null).default(null),
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
  /** Shared focal-point contract (TASK 020) - percentages (0-100) of the
   * photo, used for CSS `object-position` wherever this photo is shown
   * with `object-fit: cover`. Stored in module_items.metadata (no
   * migration needed). null/absent means "use this surface's own
   * default" - TeamEditor/facilitators-screen.tsx render that as
   * "center top" (an established, evidenced bias for headshots,
   * preserved deliberately - see TASK-020 report, Section 5), not the
   * shared component's own true-center default. Now carried through
   * publish_space() (0025_focal_point_publish.sql) into the published
   * snapshot, so this reaches the real guest app, not just Studio
   * previews. */
  imagePosition: imagePositionSchema,
});

export type PublicFacilitator = z.infer<typeof facilitatorSchema>;
export type EditableFacilitator = PublicFacilitator & {
  id: string;
  /** Client-only, resolved display URL (signed URL in the configurator, /api/media in the guest app) - never persisted, always derived from imageRef. */
  imageUrl?: string | null;
};
/** What every renderer actually needs to draw a facilitator - imageRef plus its resolved, display-ready URL. */
export type DisplayFacilitator = PublicFacilitator & { imageUrl: string | null };

/**
 * What the Studio posts when it saves the Team.
 *
 * It exists because the alternative - destructuring the fields inline in
 * the editor - is how `longBio` came to be dropped: the save carried
 * every other field, so nothing failed, and the new one was silently
 * reset to null on the next save. TASK 029 found it in real Staging QA,
 * not in a unit test.
 *
 * The rule this encodes is the metadata round-trip discipline named at
 * the top of this file: a save carries the WHOLE object, never a subset.
 * `facilitatorSavePayload` is the only place that list is written down,
 * and facilitator.test.ts asserts it covers every key the schema parses -
 * so adding a field to the schema and forgetting the save now fails the
 * suite instead of the organizer's draft.
 */
export function facilitatorSavePayload(items: readonly EditableFacilitator[]): (PublicFacilitator & { id: string })[] {
  return items.map((f) => ({
    id: f.id,
    name: f.name,
    role: f.role,
    bio: f.bio,
    longBio: f.longBio,
    imageRef: f.imageRef,
    specialties: f.specialties,
    socialLinks: f.socialLinks,
    imagePosition: f.imagePosition,
  }));
}
