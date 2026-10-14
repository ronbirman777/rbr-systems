import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES as LOCALES } from "@/lib/i18n/locales";
import { formatPrice, formatPriceFallback } from "./format";
import { storedTreatmentPricing, treatmentSchema, treatmentsNeedingCurrency } from "@/lib/modules/treatment";
import { retreatMetadataSchema } from "@/lib/teach/schemas";
import { formatRetreatPrice, validateRetreatMetadata } from "@/lib/teach/retreats";

/**
 * TASK 033 acceptance: legacy stored prices render unchanged and safely.
 * Expected strings are the ones observed in the local browser check on
 * 2026-10-14 (Flow + Teach Guest, Studio; Chromium + WebKit), so the unit
 * test and the browser evidence describe the same behaviour.
 */

const FSI = "⁨";
const PDI = "⁩";

// [stored price, stored currency, expected en output]
const FLOW_LEGACY: [number, string | null, string][] = [
  [700, "baht", "700 baht"],
  [50, "$", "50 $"],
  [50, "USD", "US$50.00"],
  [50, "usd", "US$50.00"],
  [40, null, "40"],
  [0, "EUR", "€0.00"],
  [0, "baht", "0 baht"],
  [12.345, "EUR", "€12.345"],
  [1250.5, "JPY", "JP¥1,250.5"],
  [3.5, "KWD", "KWD 3.500"],
  [99.99, "€", "99.99 €"],
  [1500.5, "EURO", "1,500.5 EURO"],
  [0.0001, "USD", "US$0.0001"],
  [1234567.89, "THB", "THB 1,234,567.89"],
  [700, "thb", "THB 700.00"],
  [25, " eur ", "€25.00"],
];

const norm = (s: string | null) => (s ?? "").replace(/ /g, " ");

describe("Flow legacy prices (guest server label = Studio after mount)", () => {
  it.each(FLOW_LEGACY)("%s %s -> %s", (price, currency, expected) => {
    const parsed = treatmentSchema.parse({
      name: "x", shortDescription: null, description: null, durationMinutes: 30, imageRef: null,
      provider: null, location: null, bookingInfo: null, imagePosition: null, price, currency,
    });
    // Read keeps the stored value exactly (never rewritten).
    expect(parsed.price).toBe(price);
    expect(parsed.currency).toBe(currency);
    expect(norm(formatPrice(parsed.price, parsed.currency, "en"))).toBe(expected);
  });

  it("free-text legacy codes are shown exactly as stored (trimmed), never reinterpreted", () => {
    for (const raw of ["baht", "$", "€", "EURO", "Bt"]) {
      expect(formatPrice(700, raw, "en")).toContain(raw);
    }
  });

  it("every case renders in all 7 locales without throwing; RTL isolates, LTR does not", () => {
    for (const locale of LOCALES) {
      for (const [price, currency] of FLOW_LEGACY) {
        const out = formatPrice(price, currency, locale);
        expect(out, `${locale} ${price} ${currency}`).toMatch(/\d/);
        const isolated = out!.startsWith(FSI) && out!.endsWith(PDI);
        expect(isolated, `${locale} isolate`).toBe(locale === "he");
        expect(formatPriceFallback(price, currency, locale)).toMatch(/\d/);
      }
    }
  });

  it("never prints a bare $ for an ISO dollar in any locale (legacy '$' stays as typed)", () => {
    for (const locale of LOCALES) {
      const out = formatPrice(50, "usd", locale)!;
      expect(out.replace(/[⁨⁩‏]/g, ""), locale).not.toMatch(/(^|[^A-Za-z])\$(?![A-Za-z])/);
    }
  });
});

describe("D-CC4 on legacy rows: untouched is lenient, new/edited needs ISO", () => {
  const stored = storedTreatmentPricing(FLOW_LEGACY.map(([price, currency], i) => ({ id: `r${i}`, metadata: currency === null ? { price } : { price, currency } })));
  const untouched = FLOW_LEGACY.map(([price, currency], i) => ({ id: `r${i}`, price, currency }));

  it("re-saving every untouched legacy row passes (e.g. after renaming one)", () => {
    expect(treatmentsNeedingCurrency(untouched, stored)).toEqual([]);
  });

  it("editing the price of a non-ISO legacy row requires an ISO code", () => {
    expect(treatmentsNeedingCurrency([{ id: "r0", price: 800, currency: "baht" }], stored)).toEqual(["r0"]);
    expect(treatmentsNeedingCurrency([{ id: "r1", price: 50, currency: "€" }], stored)).toEqual(["r1"]);
    expect(treatmentsNeedingCurrency([{ id: "r4", price: 41, currency: null }], stored)).toEqual(["r4"]);
    expect(treatmentsNeedingCurrency([{ id: "r0", price: 800, currency: "THB" }], stored)).toEqual([]);
  });

  it("editing a lower-case ISO legacy row is accepted (it is a real code)", () => {
    expect(treatmentsNeedingCurrency([{ id: "r3", price: 60, currency: "usd" }], stored)).toEqual([]);
  });

  it("a new priced row without an ISO code is refused; 0 is a price", () => {
    expect(treatmentsNeedingCurrency([{ id: "new", price: 0, currency: null }], stored)).toEqual(["new"]);
    expect(treatmentsNeedingCurrency([{ id: "new", price: 10, currency: "baht" }], stored)).toEqual(["new"]);
    expect(treatmentsNeedingCurrency([{ id: "new", price: 10, currency: "EUR" }], stored)).toEqual([]);
  });
});

describe("Teach retreat legacy prices (documented behaviour)", () => {
  const meta = (m: Record<string, unknown>) => retreatMetadataSchema.parse(m);

  it("server accepts ANY three capitals (not only ISO) and shows unknown ones raw", () => {
    const m = meta({ price: 700, currency: "XYZ" });
    expect(m.currency).toBe("XYZ");
    expect(validateRetreatMetadata(m)).toBeNull();
    expect(formatRetreatPrice(m, "en")).toBe("700 XYZ");
  });

  it("lower-case three letters are upper-cased on read", () => {
    expect(norm(formatRetreatPrice(meta({ price: 700, currency: "thb" }), "en"))).toBe("THB 700.00");
  });

  it("a non-three-letter value is dropped on read: the amount shows without currency (unchanged since TASK 031)", () => {
    expect(formatRetreatPrice(meta({ price: 700, currency: "baht" }), "en")).toBe("700");
    expect(formatRetreatPrice(meta({ price: 99, currency: "€" }), "en")).toBe("99");
    // ...and such a row needs a currency before it can be saved again.
    expect(validateRetreatMetadata(meta({ price: 700, currency: "baht" }))).toBe("priceNeedsCurrency");
  });

  it("zero, no currency and extra decimals", () => {
    expect(formatRetreatPrice(meta({ price: 0, currency: "EUR" }), "en")).toBe("€0.00");
    expect(formatRetreatPrice(meta({ price: 40, currency: null }), "en")).toBe("40");
    expect(formatRetreatPrice(meta({ price: 389.995, currency: "USD" }), "en")).toBe("US$389.995");
  });
});
