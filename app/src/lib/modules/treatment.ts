import { z } from "zod";

/**
 * "treatments" module_key. Informational only in this slice - no booking
 * flow - but bookingInfo (a free-text field: a phone number, an email, "ask
 * at reception", etc.) gives organizers a way to tell guests how to book
 * today, and the content model doesn't block a real booking system from
 * being layered on later (it would extend metadata, not replace it).
 */
export const treatmentSchema = z.object({
  name: z.string().min(1),
  shortDescription: z.string().nullable(),
  description: z.string().nullable(),
  durationMinutes: z.number().int().positive().nullable(),
  imageRef: z.string().nullable(),
  provider: z.string().nullable(),
  location: z.string().nullable(),
  bookingInfo: z.string().nullable(),
});

export type PublicTreatment = z.infer<typeof treatmentSchema>;
export type EditableTreatment = PublicTreatment & { id: string; imageUrl?: string | null };
export type DisplayTreatment = PublicTreatment & { imageUrl: string | null };
