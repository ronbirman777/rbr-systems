import { afterEach, describe, expect, it, vi } from "vitest";
import { formatDateRangeLocalized, formatShortDateLocalized } from "./datetime";

/**
 * TASK 033 D4 (Teach `de` WebKit #418): Intl output observed 2026-10-14 on
 * Node 26 (ICU 78.3, CLDR 48) vs Playwright 1.63 WebKit. The formatters must
 * produce the same text from either engine's parts, or hydration fails.
 */

afterEach(() => vi.restoreAllMocks());

type Part = { type: string; value: string };
const p = (type: string, value: string): Part => ({ type, value });

describe("formatShortDateLocalized engine parity", () => {
  it("German keeps the comma after the weekday (Node output)", () => {
    expect(formatShortDateLocalized("2026-10-14", "de")).toBe("Mi., 14. Okt.");
  });

  it("German from WebKit's parts (no comma) renders the same text", () => {
    const webkitParts = [p("weekday", "Mi."), p("literal", " "), p("day", "14"), p("literal", ". "), p("month", "Okt.")];
    vi.spyOn(Intl.DateTimeFormat.prototype, "formatToParts").mockReturnValue(webkitParts as Intl.DateTimeFormatPart[]);
    expect(formatShortDateLocalized("2026-10-14", "de")).toBe("Mi., 14. Okt.");
  });

  it("does not touch other locales or English", () => {
    expect(formatShortDateLocalized("2026-10-14", "en")).toBe("Wed 14 Oct");
    expect(formatShortDateLocalized("2026-10-14", "fr")).toBe("mer. 14 oct.");
    expect(formatShortDateLocalized("2026-10-14", "it")).toBe("mer 14 ott");
    expect(formatShortDateLocalized("not-a-date", "de")).toBe("not-a-date");
  });
});

describe("formatDateRangeLocalized engine parity", () => {
  it("never emits a thin space (Node) - browsers use plain spaces", () => {
    for (const locale of ["de", "es", "fr", "he", "tr", "it"] as const) {
      const text = formatDateRangeLocalized("2026-01-03", "2026-05-31", locale);
      expect(text, locale).not.toMatch(/ /);
    }
  });

  it("Italian day has no leading zero (Node writes 03 gen, browsers 3 gen)", () => {
    expect(formatDateRangeLocalized("2026-01-03", "2026-05-31", "it")).toBe("3 gen – 31 mag 2026");
  });

  it("Node-style parts and WebKit-style parts give the same text", () => {
    const node = [p("day", "03"), p("literal", " "), p("month", "gen"), p("literal", " – "), p("day", "31"), p("literal", " "), p("month", "mag"), p("literal", " "), p("year", "2026")];
    const webkit = [p("day", "3"), p("literal", " "), p("month", "gen"), p("literal", " – "), p("day", "31"), p("literal", " "), p("month", "mag"), p("literal", " "), p("year", "2026")];
    const spy = vi.spyOn(Intl.DateTimeFormat.prototype, "formatRangeToParts");
    spy.mockReturnValueOnce(node as never);
    const a = formatDateRangeLocalized("2026-01-03", "2026-05-31", "it");
    spy.mockReturnValueOnce(webkit as never);
    const b = formatDateRangeLocalized("2026-01-03", "2026-05-31", "it");
    expect(a).toBe(b);
    expect(a).toBe("3 gen – 31 mag 2026");
  });

  it("keeps a two-digit day and the English hand-rolled form", () => {
    expect(formatDateRangeLocalized("2026-10-14", "2026-10-20", "de")).toBe("14.–20. Okt. 2026");
    expect(formatDateRangeLocalized("2026-10-14", "2026-10-20", "en")).toBe("14–20 Oct 2026");
  });
});
