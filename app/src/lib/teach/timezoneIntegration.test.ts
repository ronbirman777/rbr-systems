import { describe, expect, it } from "vitest";
import { timezoneOptions, timezoneSelectValue } from "@/lib/timezone";
import { resolveLocalTime } from "./classTime";

// Teach's Studio pickers use the shared timezone helpers; its scheduling
// (Temporal) must keep working with whatever zone string the picker leaves stored.
const UTC_FAMILY = ["UTC", "Etc/UTC", "UCT", "Universal", "Zulu", "GMT", "Etc/GMT", "GMT0", "Greenwich"];

describe("Teach pickers on the shared timezone helpers", () => {
  it.each(UTC_FAMILY)("stored %s selects UTC and stays a valid Temporal zone", (tz) => {
    expect(timezoneSelectValue(tz)).toBe("UTC");
    expect(timezoneOptions(tz)[0]).toBe("UTC");
    expect(timezoneOptions(tz)).toContain("UTC");
    expect(resolveLocalTime("2025-07-15", "09:00", tz)).toMatchObject({ ok: true, instant: "2025-07-15T09:00:00Z" });
  });

  it("geographic zones are untouched, including zero-offset regions", () => {
    for (const tz of ["Asia/Jerusalem", "America/New_York", "Europe/London", "Africa/Abidjan", "Atlantic/Reykjavik"]) {
      expect(timezoneSelectValue(tz)).toBe(tz);
      expect(timezoneOptions(tz)).toContain(tz);
    }
    expect(resolveLocalTime("2025-07-15", "18:00", "Europe/London")).toMatchObject({ ok: true, instant: "2025-07-15T17:00:00Z" });
  });

  it("a legacy alias is kept selectable instead of silently replaced", () => {
    expect(timezoneOptions("Asia/Calcutta")).toContain("Asia/Calcutta");
  });
});
