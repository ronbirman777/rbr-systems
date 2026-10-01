import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIMEZONE,
  currentTimeInTimezone,
  listTimezones,
  timezoneOptions,
  timezoneSelectValue,
  todayInTimezone,
} from "./timezone";

describe("timezoneSelectValue", () => {
  it.each(["UTC", "Etc/UTC", "Etc/GMT", "GMT"])("%s selects UTC", (tz) => {
    expect(timezoneSelectValue(tz)).toBe("UTC");
  });

  it.each([
    "Africa/Abidjan",
    "Atlantic/Reykjavik",
    "Europe/London",
    "Asia/Bangkok",
    "Asia/Tokyo",
    "America/New_York",
    "America/Los_Angeles",
    "Australia/Sydney",
  ])("%s is preserved, never collapsed to UTC", (tz) => {
    expect(timezoneSelectValue(tz)).toBe(tz);
  });

  it("falls back to UTC for empty values", () => {
    expect(timezoneSelectValue(null)).toBe("UTC");
    expect(timezoneSelectValue(undefined)).toBe("UTC");
    expect(timezoneSelectValue("")).toBe("UTC");
    expect(DEFAULT_TIMEZONE).toBe("UTC");
  });
});

describe("timezoneOptions", () => {
  it("offers UTC first, even though Intl omits it", () => {
    expect(listTimezones()).not.toContain("UTC");
    const options = timezoneOptions("UTC");
    expect(options[0]).toBe("UTC");
    expect(options.filter((tz) => tz === "UTC")).toHaveLength(1);
  });

  it("keeps Africa/Abidjan as its own option", () => {
    expect(timezoneOptions("Africa/Abidjan")).toContain("Africa/Abidjan");
  });

  it("every UTC-family or listed stored value has a matching option", () => {
    for (const tz of ["UTC", "Etc/UTC", "Etc/GMT", "GMT", "Africa/Abidjan", "Atlantic/Reykjavik", "Europe/London", "Asia/Bangkok", "Asia/Tokyo", "America/New_York", "America/Los_Angeles", "Australia/Sydney"]) {
      expect(timezoneOptions(tz)).toContain(timezoneSelectValue(tz));
    }
  });

  it("appends an unlisted legacy alias instead of hiding it", () => {
    const options = timezoneOptions("Asia/Calcutta");
    expect(timezoneSelectValue("Asia/Calcutta")).toBe("Asia/Calcutta");
    expect(options).toContain("Asia/Calcutta");
  });
});

describe("compute helpers still accept every stored form of UTC", () => {
  it.each(["UTC", "Etc/UTC", "Etc/GMT", "GMT", "Africa/Abidjan"])("%s", (tz) => {
    expect(todayInTimezone(tz)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(currentTimeInTimezone(tz)).toMatch(/^\d{2}:\d{2}$/);
  });
});
