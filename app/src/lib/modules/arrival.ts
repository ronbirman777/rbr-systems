import { z } from "zod";

/**
 * "arrivalInfo" module_key - the first singleton module built on
 * module_settings (data jsonb, one row per tenant+module_key), proving
 * that table for real rather than leaving it unused in the schema. No
 * media - every field here is text.
 */
export const arrivalInfoSchema = z.object({
  welcomeMessage: z.string().nullable(),
  checkInTime: z.string().nullable(),
  checkOutTime: z.string().nullable(),
  address: z.string().nullable(),
  mapUrl: z.string().nullable(),
  transportationInfo: z.string().nullable(),
  arrivalInstructions: z.string().nullable(),
  whatToBring: z.string().nullable(),
  importantNotes: z.string().nullable(),
  contactName: z.string().nullable(),
  contactPhone: z.string().nullable(),
  contactWhatsapp: z.string().nullable(),
});

export type ArrivalInfo = z.infer<typeof arrivalInfoSchema>;

export const EMPTY_ARRIVAL_INFO: ArrivalInfo = {
  welcomeMessage: null,
  checkInTime: null,
  checkOutTime: null,
  address: null,
  mapUrl: null,
  transportationInfo: null,
  arrivalInstructions: null,
  whatToBring: null,
  importantNotes: null,
  contactName: null,
  contactPhone: null,
  contactWhatsapp: null,
};
