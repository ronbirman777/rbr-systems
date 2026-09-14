import { describe, expect, it } from "vitest";
import { validateAdditionalLinks } from "./featuredValidation";

describe("validateAdditionalLinks - client-side mirror of the DB's is_valid_additional_links", () => {
  it("accepts an empty array", () => {
    expect(validateAdditionalLinks([])).toBeNull();
  });

  it("accepts up to 6 valid links", () => {
    const links = Array.from({ length: 6 }, (_, i) => ({ label: `Link ${i}`, url: `https://example.com/${i}` }));
    expect(validateAdditionalLinks(links)).toBeNull();
  });

  it("rejects more than 6 links", () => {
    const links = Array.from({ length: 7 }, (_, i) => ({ label: `Link ${i}`, url: `https://example.com/${i}` }));
    expect(validateAdditionalLinks(links)).toMatch(/up to 6/i);
  });

  it("rejects a link with an empty label", () => {
    expect(validateAdditionalLinks([{ label: "", url: "https://example.com" }])).toMatch(/label/i);
  });

  it("rejects a label over 60 characters", () => {
    expect(validateAdditionalLinks([{ label: "x".repeat(61), url: "https://example.com" }])).toMatch(/label/i);
  });

  it("accepts a label at exactly 60 characters", () => {
    expect(validateAdditionalLinks([{ label: "x".repeat(60), url: "https://example.com" }])).toBeNull();
  });

  it("rejects a URL that isn't http/https", () => {
    expect(validateAdditionalLinks([{ label: "Booking", url: "ftp://example.com" }])).toMatch(/http/i);
  });

  it("rejects an empty URL", () => {
    expect(validateAdditionalLinks([{ label: "Booking", url: "" }])).toMatch(/http/i);
  });

  it("rejects a URL over 500 characters", () => {
    const longUrl = "https://example.com/" + "a".repeat(500);
    expect(validateAdditionalLinks([{ label: "Booking", url: longUrl }])).toMatch(/http/i);
  });
});
