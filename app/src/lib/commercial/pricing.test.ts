import { describe, expect, it } from "vitest";
import { monthlyPriceForSpaces, pricingPreviewForAddingSpace, DONE_FOR_YOU_SETUP_PRICE_USD } from "./pricing";

describe("monthlyPriceForSpaces - boundary values from the approved pricing model", () => {
  const cases: Array<[number, number]> = [
    [0, 0],
    [1, 25],
    [2, 50],
    [3, 69],
    [4, 88],
    [5, 107],
    [10, 202],
  ];

  for (const [quantity, expected] of cases) {
    it(`${quantity} space(s) -> $${expected}/month`, () => {
      expect(monthlyPriceForSpaces(quantity)).toBe(expected);
    });
  }

  it("rejects a negative quantity", () => {
    expect(() => monthlyPriceForSpaces(-1)).toThrow(RangeError);
  });

  it("rejects a non-integer quantity", () => {
    expect(() => monthlyPriceForSpaces(1.5)).toThrow(RangeError);
  });
});

describe("pricingPreviewForAddingSpace - the before/after shown prior to Add Another Space", () => {
  it("2 -> 3 spaces: $50/month -> $69/month, a $19 increase", () => {
    const preview = pricingPreviewForAddingSpace(2);
    expect(preview).toEqual({
      currentQuantity: 2,
      currentMonthly: 50,
      nextQuantity: 3,
      nextMonthly: 69,
      monthlyIncrease: 19,
    });
  });

  it("0 -> 1 space (first Space): $0/month -> $25/month", () => {
    const preview = pricingPreviewForAddingSpace(0);
    expect(preview.currentMonthly).toBe(0);
    expect(preview.nextMonthly).toBe(25);
    expect(preview.monthlyIncrease).toBe(25);
  });

  it("1 -> 2 spaces: still the flat $25 tier, a $25 increase (not yet discounted)", () => {
    const preview = pricingPreviewForAddingSpace(1);
    expect(preview.currentMonthly).toBe(25);
    expect(preview.nextMonthly).toBe(50);
    expect(preview.monthlyIncrease).toBe(25);
  });

  it("9 -> 10 spaces: every additional space past the 2nd is the flat $19 increment", () => {
    const preview = pricingPreviewForAddingSpace(9);
    expect(preview.monthlyIncrease).toBe(19);
  });
});

describe("Done For You Setup - optional, one-time, per Space", () => {
  it("is $99 and is never bundled into the recurring monthly figure", () => {
    expect(DONE_FOR_YOU_SETUP_PRICE_USD).toBe(99);
  });
});
