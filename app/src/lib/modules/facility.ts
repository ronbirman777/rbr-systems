import { z } from "zod";
import { imagePositionSchema } from "./imagePosition";

/** "facilities" module_key - Pool, Sauna, Yoga Shala, etc. No real-time status in this slice, just browsable information. */
export const facilitySchema = z.object({
  name: z.string().min(1),
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
