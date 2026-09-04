import { z } from "zod";

/**
 * The explicit schema for the "facilitators" module_key - name, role, bio,
 * imageRef. Every module built on module_items needs one of these; this is
 * what keeps the shared table from becoming an unvalidated free-form CMS.
 */
export const facilitatorSchema = z.object({
  name: z.string().min(1),
  role: z.string().nullable(),
  bio: z.string().nullable(),
  /** Durable Storage path (tenant-media bucket), e.g. "{tenantId}/facilitators/{itemId}.jpg" - never a temporary browser blob/object URL. */
  imageRef: z.string().nullable(),
});

export type PublicFacilitator = z.infer<typeof facilitatorSchema>;
export type EditableFacilitator = PublicFacilitator & {
  id: string;
  /** Client-only, resolved display URL (signed URL in the configurator, /api/media in the guest app) - never persisted, always derived from imageRef. */
  imageUrl?: string | null;
};
/** What every renderer actually needs to draw a facilitator - imageRef plus its resolved, display-ready URL. */
export type DisplayFacilitator = PublicFacilitator & { imageUrl: string | null };
