import { z } from "zod";
import { describe, expect, it } from "vitest";
import { storedTreatmentPricing, treatmentSchema, treatmentsNeedingCurrency } from "./treatment";
import { formatPrice } from "@/lib/currencies/format";

/** TASK 033 (D-CC4): Flow Treatments & Extras currency rules. */

const base = {
  name: "Thai massage",
  shortDescription: null,
  description: null,
  durationMinutes: 60,
  imageRef: null,
  provider: null,
  location: null,
  bookingInfo: null,
  imagePosition: null,
};

describe("treatment currency - read stays lenient", () => {
  it("keeps legacy non-ISO values exactly as stored", () => {
    for (const legacy of ["€", "BAHT", "EURO", "eur"]) {
      expect(treatmentSchema.parse({ ...base, price: 700, currency: legacy }).currency).toBe(legacy);
    }
  });
  it("one bad currency never fails the whole published array", () => {
    const rows = [
      { ...base, price: 700, currency: "THB" },
      { ...base, price: 5, currency: { bad: true } },
      { ...base, price: 9, currency: "x".repeat(40) },
    ];
    const parsed = z.array(treatmentSchema).safeParse(rows);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.map((r) => r.currency)).toEqual(["THB", null, null]);
  });
});

describe("treatmentsNeedingCurrency - new/edited priced rows need an ISO code", () => {
  const stored = storedTreatmentPricing([
    { id: "legacy", metadata: { price: 700, currency: "BAHT" } },
    { id: "legacyNoCurrency", metadata: { price: 50 } },
    { id: "iso", metadata: { price: 10, currency: "EUR" } },
    { id: "unpriced", metadata: {} },
  ]);
  const row = (id: string, price: number | null, currency: string | null) => ({ id, price, currency });

  it("untouched legacy rows still pass", () => {
    expect(treatmentsNeedingCurrency([row("legacy", 700, "BAHT"), row("legacyNoCurrency", 50, null)], stored)).toEqual([]);
  });
  it("a new priced row needs an ISO code", () => {
    expect(treatmentsNeedingCurrency([row("new", 80, null)], stored)).toEqual(["new"]);
    expect(treatmentsNeedingCurrency([row("new", 80, "EURO")], stored)).toEqual(["new"]);
    expect(treatmentsNeedingCurrency([row("new", 80, "EUR")], stored)).toEqual([]);
    expect(treatmentsNeedingCurrency([row("new", 0, "THB")], stored)).toEqual([]);
  });
  it("editing a legacy row's price or currency requires an ISO code", () => {
    expect(treatmentsNeedingCurrency([row("legacy", 800, "BAHT")], stored)).toEqual(["legacy"]);
    expect(treatmentsNeedingCurrency([row("legacy", 700, "BHT")], stored)).toEqual(["legacy"]);
    expect(treatmentsNeedingCurrency([row("legacy", 700, "THB")], stored)).toEqual([]);
    expect(treatmentsNeedingCurrency([row("unpriced", 30, null)], stored)).toEqual(["unpriced"]);
  });
  it("rows without a price never need a currency", () => {
    expect(treatmentsNeedingCurrency([row("new", null, null), row("iso", null, "EURO")], stored)).toEqual([]);
  });
});

describe("treatment price display", () => {
  it("formats ISO codes and shows legacy codes raw - never converted", () => {
    expect(formatPrice(700, "THB", "en")).toBe("THB 700.00");
    expect(formatPrice(1500.5, "EURO", "en")).toBe("1,500.5 EURO");
  });
});
