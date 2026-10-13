import { afterEach, describe, expect, it } from "vitest";
import { flowInspirationDayOne, getDailyQuoteFrom, getFlowDailyQuote } from "./dailyQuotes";
import { buildRetreatDays, epochDayToIso, isoToEpochDay, retreatDayOne } from "@/lib/schedule/retreatDays";

/**
 * TASK 033 fix 3: Daily Inspiration "Day 1" follows the canonical retreat
 * start date (the Day Navigator's Day 1) and stays byte-identical for
 * Spaces without retreat dates.
 */

const items = ["r1", "r2", "r3"].map((text) => ({ text, label: null }));
const pick = (dateIso: string, anchor: string | null) => getFlowDailyQuote(dateIso, items, anchor).text;

/** The anchor exactly as guest-app.tsx computed it at a13296d (frozen copy). */
function legacyAnchor(schedule: readonly { date: string }[]): string | null {
  return schedule.reduce<string | null>((min, s) => (min === null || s.date < min ? s.date : min), null);
}

function datesBetween(fromIso: string, toIso: string): string[] {
  const out: string[] = [];
  for (let n = isoToEpochDay(fromIso)!; n <= isoToEpochDay(toIso)!; n++) out.push(epochDayToIso(n));
  return out;
}

describe("flowInspirationDayOne - Spaces without retreat dates (legacy)", () => {
  const schedules: { date: string }[][] = [
    [],
    [{ date: "2027-10-14" }],
    [{ date: "2027-10-16" }, { date: "2027-10-14" }, { date: "2027-10-16" }],
    [{ date: "2027-10-14" }, { date: "2027-10-20" }], // interior gap
    [{ date: "2027-12-30" }, { date: "2028-01-02" }], // year boundary
    // Malformed draft values (the Studio preview renders the draft schedule):
    // the legacy raw-string minimum is kept as-is, never "repaired".
    [{ date: "" }, { date: "2027-10-14" }],
    [{ date: "garbage" }, { date: "2027-10-14" }],
  ];
  const profiles = [undefined, null, {}, { startDate: null, endDate: null }, { startDate: undefined, endDate: undefined }];
  const todays = [...datesBetween("2027-10-10", "2027-10-25"), ...datesBetween("2027-12-28", "2028-01-06")];

  it("returns exactly the a13296d anchor for every schedule and empty date pair", () => {
    for (const schedule of schedules) {
      for (const profile of profiles) {
        expect(flowInspirationDayOne(schedule.map((s) => s.date), profile)).toBe(legacyAnchor(schedule));
      }
    }
  });

  it("so the reflection shown on every day is unchanged", () => {
    for (const schedule of schedules) {
      for (const today of todays) {
        const before = getFlowDailyQuote(today, items, legacyAnchor(schedule));
        const after = getFlowDailyQuote(today, items, flowInspirationDayOne(schedule.map((s) => s.date), undefined));
        expect(after).toEqual(before);
      }
    }
  });

  it("treats malformed stored dates as unset (legacy path)", () => {
    expect(flowInspirationDayOne(["2027-10-16", "2027-10-14"], { startDate: "garbage", endDate: "2027-02-30" })).toBe("2027-10-14");
  });
});

describe("flowInspirationDayOne - with retreat dates", () => {
  it("anchors Day 1 to the start date even when the first day has no activities", () => {
    // Arrival day 14th has nothing scheduled; activities start on the 15th.
    const dates = ["2027-10-15", "2027-10-16", "2027-10-19"];
    const anchor = flowInspirationDayOne(dates, { startDate: "2027-10-14", endDate: "2027-10-19" });
    expect(anchor).toBe("2027-10-14");
    expect(pick("2027-10-14", anchor)).toBe("r1"); // Day 1
    expect(pick("2027-10-15", anchor)).toBe("r2"); // Day 2 - legacy would have shown r1 here
    expect(pick("2027-10-17", anchor)).toBe("r1"); // Day 4, a gap day, still counts
    expect(pick("2027-10-19", anchor)).toBe("r3"); // Day 6
  });

  it("before the start date falls back to day-of-year rotation (no Day n yet)", () => {
    const anchor = flowInspirationDayOne(["2027-10-15"], { startDate: "2027-10-14", endDate: "2027-10-19" });
    expect(getFlowDailyQuote("2027-10-10", items, anchor).text).toBe(
      getDailyQuoteFrom("2027-10-10", items.map((i) => i.text))!.text
    );
  });

  it("after the end date keeps cycling from the calendar Day n", () => {
    const anchor = flowInspirationDayOne([], { startDate: "2027-10-14", endDate: "2027-10-16" });
    expect(pick("2027-10-17", anchor)).toBe("r1"); // Day 4
    expect(pick("2027-10-18", anchor)).toBe("r2"); // Day 5
  });

  it("uses the start date alone, and the navigator's derived start when only an end date is set", () => {
    expect(flowInspirationDayOne(["2027-10-20"], { startDate: "2027-10-14", endDate: null })).toBe("2027-10-14");
    expect(flowInspirationDayOne(["2027-10-12", "2027-10-15"], { startDate: null, endDate: "2027-10-19" })).toBe("2027-10-12");
    expect(flowInspirationDayOne([], { startDate: null, endDate: "2027-10-19" })).toBe("2027-10-19");
  });

  it("matches the Day Navigator's Day n on every listed day (single definition)", () => {
    const cases = [
      { activityDates: ["2027-10-15", "2027-10-18", "2027-10-22"], startDate: "2027-10-14", endDate: "2027-10-19" },
      { activityDates: ["2027-10-10", "2027-10-15"], startDate: "2027-10-14", endDate: "2027-10-16" }, // activity before start
      { activityDates: ["2027-10-12", "2027-10-15"], startDate: null, endDate: "2027-10-19" },
      { activityDates: ["2027-12-30", "2028-01-03"], startDate: "2027-12-29", endDate: "2028-01-04" },
    ];
    for (const input of cases) {
      const anchor = flowInspirationDayOne(input.activityDates, input);
      expect(anchor).toBe(retreatDayOne(input));
      const { days } = buildRetreatDays({ ...input, todayIso: "2000-01-01" });
      expect(days.length).toBeGreaterThan(0);
      for (const day of days) {
        const expected =
          day.dayNumber === null
            ? getDailyQuoteFrom(day.date, items.map((i) => i.text))!.text
            : items[(day.dayNumber - 1) % items.length].text;
        expect(pick(day.date, anchor)).toBe(expected);
      }
    }
  });
});

describe("timezone independence", () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it("gives the same anchor and reflections under any process timezone", () => {
    const run = () => {
      const anchor = flowInspirationDayOne(["2027-03-28", "2027-11-07"], { startDate: "2027-03-27", endDate: "2027-04-02" });
      return [anchor, ...datesBetween("2027-03-20", "2027-04-08").map((d) => pick(d, anchor))];
    };
    const results = ["UTC", "America/Los_Angeles", "Pacific/Kiritimati", "Asia/Kolkata", "Europe/Berlin"].map((tz) => {
      process.env.TZ = tz;
      return run();
    });
    for (const r of results) expect(r).toEqual(results[0]);
  });
});

describe("Guest App wiring (structural)", () => {
  it("anchors the Flow Daily Inspiration through flowInspirationDayOne with the retreat profile", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const src = readFileSync(path.join(process.cwd(), "src/components/guest-app.tsx"), "utf8");
    expect(src).toMatch(/getFlowDailyQuote\([\s\S]*?flowInspirationDayOne\(\s*props\.schedule\.map\(\(s\) => s\.date\),\s*props\.retreatProfile\s*\)/);
    // The pre-TASK-033 inline anchor (first scheduled day only) is gone.
    expect(src).not.toContain("props.schedule.reduce<string | null>");
  });
});
