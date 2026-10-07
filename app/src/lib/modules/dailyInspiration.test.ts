import { describe, expect, it } from "vitest";
import {
  inspirationItemSchema,
  parsePublishedInspirations,
  visibleInspirations,
  type EditableInspirationItem,
} from "./dailyInspiration";
import { getDailyQuote, getFlowDailyQuote } from "@/lib/content/dailyQuotes";

const item = (over: Partial<EditableInspirationItem>): EditableInspirationItem => ({
  id: "i",
  label: "",
  text: "x",
  enabled: true,
  ...over,
});

describe("editor -> guest projection", () => {
  it("keeps order, drops disabled and empty items, trims", () => {
    const out = visibleInspirations([
      item({ id: "a", text: "  first " }),
      item({ id: "b", text: "hidden", enabled: false }),
      item({ id: "c", text: "   " }),
      item({ id: "d", text: "last", label: " Day 4 " }),
    ]);
    expect(out).toEqual([
      { text: "first", label: null },
      { text: "last", label: "Day 4" },
    ]);
  });

  it("reordering the editor list reorders what guests get", () => {
    const list = [item({ id: "a", text: "A" }), item({ id: "b", text: "B" })];
    expect(visibleInspirations(list).map((i) => i.text)).toEqual(["A", "B"]);
    expect(visibleInspirations([...list].reverse()).map((i) => i.text)).toEqual(["B", "A"]);
  });
});

describe("write schema", () => {
  it("accepts a draft with empty text (it simply never publishes)", () => {
    expect(inspirationItemSchema.safeParse({ label: "", text: "", enabled: true }).success).toBe(true);
  });
  it("rejects overlong text and a missing enabled flag", () => {
    expect(inspirationItemSchema.safeParse({ label: "", text: "x".repeat(1001), enabled: true }).success).toBe(false);
    expect(inspirationItemSchema.safeParse({ label: "", text: "x" }).success).toBe(false);
  });
});

describe("published read is tolerant", () => {
  it("absent, wrong-typed and malformed all mean 'use the built-in list'", () => {
    for (const raw of [undefined, null, "x", {}, 4, [{}], [{ text: "" }], [{ text: 5 }]]) {
      expect(parsePublishedInspirations(raw)).toEqual([]);
    }
  });
  it("reads a well-formed snapshot and ignores unknown keys", () => {
    expect(parsePublishedInspirations([{ label: null, text: "a", extra: 1 }, { label: " L ", text: "b" }])).toEqual([
      { label: null, text: "a" },
      { label: "L", text: "b" },
    ]);
  });
});

describe("getFlowDailyQuote", () => {
  const two = [
    { text: "one", label: null },
    { text: "two", label: "L" },
  ];
  it("with none, is exactly getDailyQuote (old Spaces unchanged)", () => {
    expect(getFlowDailyQuote("2026-05-04", [])).toEqual(getDailyQuote("2026-05-04"));
    expect(getFlowDailyQuote("2026-05-04", [{ text: "  ", label: null }])).toEqual(getDailyQuote("2026-05-04"));
  });
  it("anchors Day 1 to the first scheduled day and cycles", () => {
    expect(getFlowDailyQuote("2027-10-14", two, "2027-10-14").text).toBe("one");
    expect(getFlowDailyQuote("2027-10-15", two, "2027-10-14")).toMatchObject({ text: "two", source: "L", custom: true });
    expect(getFlowDailyQuote("2027-10-16", two, "2027-10-14").text).toBe("one");
  });
  it("ignores a malformed anchor and never throws on bad dates", () => {
    expect(() => getFlowDailyQuote("not-a-date", two, "also-bad")).not.toThrow();
    expect(getFlowDailyQuote("2027-10-14", two, "garbage").custom).toBe(true);
  });
});
