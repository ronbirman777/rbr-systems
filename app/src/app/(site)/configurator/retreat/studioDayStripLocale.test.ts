import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// TASK 033: the Studio schedule day strip must follow the Studio locale on UTC dates, never the device locale/timezone.
describe("Studio schedule day strip", () => {
  const source = readFileSync(join(__dirname, "retreat-configurator.tsx"), "utf8");
  it("does not format dates with the device locale", () => {
    expect(source).not.toContain("toLocaleDateString(undefined");
  });
  it("formats the weekday with the Studio locale on a UTC-noon date", () => {
    expect(source).toContain("studioDayStrip(date, locale)");
    expect(source).toMatch(/T12:00:00Z/);
  });
});
