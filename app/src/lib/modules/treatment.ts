import { z } from "zod";
import { imagePositionSchema } from "./imagePosition";

/**
 * "treatments" module_key. Informational only in this slice - no booking
 * flow - but bookingInfo (a free-text field: a phone number, an email, "ask
 * at reception", etc.) gives organizers a way to tell guests how to book
 * today, and the content model doesn't block a real booking system from
 * being layered on later (it would extend metadata, not replace it).
 */
/**
 * Whether the retreat price already covers this, or the guest pays extra
 * (TASK 029, D1). Two values, because those are the two answers a guest
 * needs; "included" is not the absence of a price, since an organizer may
 * well want to show what an included treatment is worth.
 *
 * This is retreat-item pricing and has nothing to do with InnerDweS
 * billing: nothing here touches space_entitlements, Stripe, or any
 * payment flow, and no money changes hands through the Guest App. It is
 * descriptive text and a number the organizer typed.
 */
export const CHARGE_TYPES = ["included", "additional"] as const;
export type ChargeType = (typeof CHARGE_TYPES)[number];

export const treatmentSchema = z.object({
  name: z.string().min(1),
  shortDescription: z.string().nullable(),
  description: z.string().nullable(),
  durationMinutes: z.number().int().positive().nullable(),
  imageRef: z.string().nullable(),
  provider: z.string().nullable(),
  location: z.string().nullable(),
  bookingInfo: z.string().nullable(),
  /** TASK 020 - shared focal-point contract; see meal.ts/facilitator.ts. */
  imagePosition: imagePositionSchema,
  /**
   * TASK 029 (D1): this module absorbed Wellness Extras rather than a
   * second module being invented for them, so it carries what an extra
   * needs and a treatment also wants.
   *
   * All four default rather than being required, which is load-bearing
   * for backward compatibility in exactly the way `specialties` is in
   * facilitator.ts: a snapshot published before 0033 has none of these
   * keys, and without the defaults parsing it would fail outright and
   * blank an already-published Space's Treatments screen.
   *
   * `price` is a plain number and `currency` a free short string, not an
   * ISO-4217 enum: an organizer in Thailand types THB, one in Germany
   * types EUR, and an enum would simply refuse the ones we forgot.
   */
  price: z.number().nonnegative().nullable().catch(null).default(null),
  currency: z.string().max(8).nullable().catch(null).default(null),
  chargeType: z.enum(CHARGE_TYPES).nullable().catch(null).default(null),
  availability: z.string().max(200).nullable().catch(null).default(null),
});

export type PublicTreatment = z.infer<typeof treatmentSchema>;
export type EditableTreatment = PublicTreatment & { id: string; imageUrl?: string | null };
export type DisplayTreatment = PublicTreatment & { imageUrl: string | null };
