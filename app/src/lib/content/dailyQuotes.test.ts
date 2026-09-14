import { describe, expect, it } from "vitest";
import { DAILY_QUOTES, getDailyQuote } from "./dailyQuotes";

describe("DAILY_QUOTES", () => {
  it("has exactly 31 entries, one per day of the longest month", () => {
    expect(DAILY_QUOTES).toHaveLength(31);
  });

  it("has non-empty text and source for every entry", () => {
    for (const quote of DAILY_QUOTES) {
      expect(quote.text.length).toBeGreaterThan(0);
      expect(quote.source.length).toBeGreaterThan(0);
    }
  });
});

describe("getDailyQuote", () => {
  it("maps day 1 to the first quote", () => {
    expect(getDailyQuote("2026-09-01")).toBe(DAILY_QUOTES[0]);
  });

  it("maps day 31 to the last quote", () => {
    expect(getDailyQuote("2026-01-31")).toBe(DAILY_QUOTES[30]);
  });

  it("maps day 15 to the 15th quote (mid-array, exercises real indexing)", () => {
    expect(getDailyQuote("2026-03-15")).toBe(DAILY_QUOTES[14]);
  });

  it("is deterministic - same date always returns the same quote", () => {
    expect(getDailyQuote("2026-06-11")).toBe(getDailyQuote("2026-06-11"));
  });

  it("depends only on day-of-month, not month or year", () => {
    expect(getDailyQuote("2026-01-05")).toBe(getDailyQuote("2027-12-05"));
  });
});
