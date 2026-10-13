import { z } from "zod";
import { imagePositionSchema } from "./imagePosition";
import { isIsoCurrency } from "@/lib/currencies";

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
   * `price` is a plain number in major units. `currency` stays a lenient
   * short string on READ (TASK 033, D-CC4): legacy rows hold values such as
   * "€", "BAHT" or "EURO", which are displayed raw and never rewritten, and
   * one bad value must never fail the whole published `treatments` array.
   * The Studio now picks an ISO 4217 code, and SAVE requires one for every
   * new or edited priced row - see treatmentsNeedingCurrency() below.
   */
  price: z.number().nonnegative().nullable().catch(null).default(null),
  currency: z.string().max(8).nullable().catch(null).default(null),
  chargeType: z.enum(CHARGE_TYPES).nullable().catch(null).default(null),
  availability: z.string().max(200).nullable().catch(null).default(null),
});

export type PublicTreatment = z.infer<typeof treatmentSchema>;
export type EditableTreatment = PublicTreatment & { id: string; imageUrl?: string | null };
export type DisplayTreatment = PublicTreatment & {
  imageUrl: string | null;
  /**
   * TASK 033: the price pre-formatted on the SERVER (formatPrice) for the
   * published Guest App, so the client renders exactly the server's string.
   * Absent in the Studio preview, which formats after mount instead.
   */
  priceLabel?: string | null;
};

/** The stored pricing of an existing row, as read from module_items.metadata. */
export type StoredTreatmentPricing = { price: unknown; currency: unknown };

/** Builds the stored-pricing lookup from `module_items` rows (id + metadata). */
export function storedTreatmentPricing(rows: readonly { id: string; metadata: unknown }[]): Map<string, StoredTreatmentPricing> {
  const map = new Map<string, StoredTreatmentPricing>();
  for (const row of rows) {
    const m = (row.metadata ?? {}) as { price?: unknown; currency?: unknown };
    map.set(row.id, { price: m.price ?? null, currency: m.currency ?? null });
  }
  return map;
}

/**
 * TASK 033 (D-CC4): ids of rows that must carry an ISO 4217 currency before
 * they can be saved - rows with a price that are NEW, or whose price or
 * currency differs from what is stored. An untouched legacy row (say
 * 700 + "BAHT") passes unchanged, so existing Spaces keep saving and
 * publishing exactly as before; editing its price or currency asks for a
 * real code. Amounts are never converted.
 */
export function treatmentsNeedingCurrency(
  items: readonly { id: string; price: number | null; currency: string | null }[],
  stored: ReadonlyMap<string, StoredTreatmentPricing>
): string[] {
  const out: string[] = [];
  for (const item of items) {
    if (item.price === null || item.price === undefined) continue;
    if (isIsoCurrency(item.currency)) continue;
    const before = stored.get(item.id);
    const untouched = before !== undefined && before.price === item.price && (before.currency ?? null) === (item.currency ?? null);
    if (!untouched) out.push(item.id);
  }
  return out;
}
