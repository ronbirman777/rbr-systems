import { afterEach, describe, expect, it } from "vitest";
import {
  buildRetreatDays,
  countOutsideRetreatDates,
  isWithinRetreatDates,
  defaultRetreatDay,
  inclusiveDaySpan,
  isoToEpochDay,
  MAX_NAVIGATOR_SPAN_DAYS,
  MAX_RETREAT_RANGE_DAYS,
  validateRetreatDates,
} from "./retreatDays";

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
  process.env.TZ = ORIGINAL_TZ;
});

const dates = (r: ReturnType<typeof buildRetreatDays>) => r.days.map((d) => d.date);
const numbers = (r: ReturnType<typeof buildRetreatDays>) => r.days.map((d) => d.dayNumber);

describe("buildRetreatDays - configured start/end (A1)", () => {
  it("lists every calendar day start->end inclusive, Oct 14-19 2027 = Day 1-6", () => {
    const r = buildRetreatDays({ activityDates: ["2027-10-15"], startDate: "2027-10-14", endDate: "2027-10-19", todayIso: "2027-01-01" });
    expect(dates(r)).toEqual(["2027-10-14", "2027-10-15", "2027-10-16", "2027-10-17", "2027-10-18", "2027-10-19"]);
    expect(numbers(r)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(r.derived).toBe(false);
  });

  it("includes days with no activities and flags which days have some", () => {
    const r = buildRetreatDays({ activityDates: ["2027-10-15", "2027-10-15", "2027-10-18"], startDate: "2027-10-14", endDate: "2027-10-19", todayIso: "2027-01-01" });
    expect(r.days.map((d) => d.hasActivities)).toEqual([false, true, false, false, true, false]);
  });

  it("an arrival day without activities is still Day 1 (no off-by-one)", () => {
    const r = buildRetreatDays({ activityDates: ["2027-10-15"], startDate: "2027-10-14", endDate: "2027-10-15", todayIso: "2027-01-01" });
    expect(r.days.find((d) => d.date === "2027-10-15")?.dayNumber).toBe(2);
  });

  it("crosses month and year boundaries and a leap day by calendar", () => {
    const r = buildRetreatDays({ activityDates: [], startDate: "2027-12-30", endDate: "2028-01-02", todayIso: "2000-01-01" });
    expect(dates(r)).toEqual(["2027-12-30", "2027-12-31", "2028-01-01", "2028-01-02"]);
    const leap = buildRetreatDays({ activityDates: [], startDate: "2028-02-28", endDate: "2028-03-01", todayIso: "2000-01-01" });
    expect(dates(leap)).toEqual(["2028-02-28", "2028-02-29", "2028-03-01"]);
    expect(numbers(leap)).toEqual([1, 2, 3]);
  });

  it("ignores a stored end before the start instead of reversing the list", () => {
    const r = buildRetreatDays({ activityDates: [], startDate: "2027-10-14", endDate: "2027-10-10", todayIso: "2000-01-01" });
    expect(dates(r)).toEqual(["2027-10-14"]);
  });
});

describe("buildRetreatDays - fallback when dates are unset (derived)", () => {
  it("runs earliest->latest activity date, fills gaps, numbers by calendar offset", () => {
    const r = buildRetreatDays({ activityDates: ["2027-10-17", "2027-10-14", "2027-10-14"], todayIso: "2000-01-01" });
    expect(r.derived).toBe(true);
    expect(dates(r)).toEqual(["2027-10-14", "2027-10-15", "2027-10-16", "2027-10-17"]);
    // Gaps never renumber: the 17th is Day 4, not Day 2.
    expect(numbers(r)).toEqual([1, 2, 3, 4]);
  });

  it("is empty when there are no dates at all", () => {
    expect(buildRetreatDays({ activityDates: [], todayIso: "2027-10-14" })).toEqual({ days: [], derived: true });
  });

  it("drops malformed and impossible activity dates", () => {
    const r = buildRetreatDays({ activityDates: ["2027-02-30", "nope", "2027-03-01"], todayIso: "2000-01-01" });
    expect(dates(r)).toEqual(["2027-03-01"]);
  });

  it("fills a missing end from the latest activity and a missing start from the earliest", () => {
    const onlyStart = buildRetreatDays({ activityDates: ["2027-10-16"], startDate: "2027-10-14", todayIso: "2000-01-01" });
    expect(dates(onlyStart)).toEqual(["2027-10-14", "2027-10-15", "2027-10-16"]);
    expect(onlyStart.derived).toBe(false);
    const onlyEnd = buildRetreatDays({ activityDates: ["2027-10-15"], endDate: "2027-10-17", todayIso: "2000-01-01" });
    expect(dates(onlyEnd)).toEqual(["2027-10-15", "2027-10-16", "2027-10-17"]);
    expect(numbers(onlyEnd)).toEqual([1, 2, 3]);
  });
});

describe("buildRetreatDays - both dates set: exact boundaries (TASK 033 addendum A)", () => {
  // DEPARTURE from TASK 033 P2: an activity outside an explicit start/end
  // range used to EXTEND the list (flagged outsideRange). The owner's rule
  // is now that both dates are hard boundaries.
  it("owner example: 2026-10-13..17 with stray activities on 2026-10-03 -> exactly Day 1..Day 5", () => {
    const r = buildRetreatDays({
      activityDates: ["2026-10-03", "2026-10-03", "2026-10-13", "2026-10-14", "2026-10-14"],
      startDate: "2026-10-13",
      endDate: "2026-10-17",
      todayIso: "2026-10-03",
    });
    expect(dates(r)).toEqual(["2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17"]);
    expect(numbers(r)).toEqual([1, 2, 3, 4, 5]);
    expect(r.days.every((d) => !d.outsideRange)).toBe(true);
    expect(r.days.some((d) => d.isToday)).toBe(false);
    expect(r.days.map((d) => d.hasActivities)).toEqual([true, true, false, false, false]);
  });

  it("does not extend after the end", () => {
    const r = buildRetreatDays({ activityDates: ["2027-10-21"], startDate: "2027-10-14", endDate: "2027-10-19", todayIso: "2000-01-01" });
    expect(dates(r).at(-1)).toBe("2027-10-19");
    expect(r.days).toHaveLength(6);
  });

  it("does not extend before the start", () => {
    const r = buildRetreatDays({ activityDates: ["2027-10-12"], startDate: "2027-10-14", endDate: "2027-10-15", todayIso: "2000-01-01" });
    expect(dates(r)).toEqual(["2027-10-14", "2027-10-15"]);
    expect(numbers(r)).toEqual([1, 2]);
  });

  it("a stray activity years away no longer adds a chip", () => {
    const r = buildRetreatDays({ activityDates: ["2029-01-01"], startDate: "2027-10-14", endDate: "2027-10-16", todayIso: "2000-01-01" });
    expect(dates(r)).toEqual(["2027-10-14", "2027-10-15", "2027-10-16"]);
  });

  it("guards a stored range longer than the navigator cap", () => {
    const r = buildRetreatDays({ activityDates: [], startDate: "2027-01-01", endDate: "2028-01-01", todayIso: "2000-01-01" });
    expect(r.days).toHaveLength(MAX_NAVIGATOR_SPAN_DAYS);
  });
});

describe("buildRetreatDays - one side only keeps the earlier behaviour", () => {
  it("start only: an activity before the start is still listed, unnumbered and flagged", () => {
    const r = buildRetreatDays({ activityDates: ["2027-10-12", "2027-10-16"], startDate: "2027-10-14", todayIso: "2000-01-01" });
    expect(dates(r)).toEqual(["2027-10-12", "2027-10-13", "2027-10-14", "2027-10-15", "2027-10-16"]);
    expect(numbers(r)).toEqual([null, null, 1, 2, 3]);
    expect(r.days[0].outsideRange).toBe(true);
  });

  it("a span beyond the cap keeps the start of the range plus the activity dates (no end set)", () => {
    const r = buildRetreatDays({ activityDates: ["2027-10-14", "2029-01-01"], startDate: "2027-10-14", todayIso: "2000-01-01" });
    // unchanged pre-addendum rule: the first MAX_NAVIGATOR_SPAN_DAYS days of the range plus every activity date
    expect(r.days).toHaveLength(MAX_NAVIGATOR_SPAN_DAYS + 1);
    expect(dates(r)[0]).toBe("2027-10-14");
    expect(dates(r).at(-1)).toBe("2029-01-01");
    expect(r.days.at(-1)?.dayNumber).toBe((isoToEpochDay("2029-01-01")! - isoToEpochDay("2027-10-14")!) + 1);
  });
});

describe("isWithinRetreatDates / countOutsideRetreatDates", () => {
  it("filters only when both dates are set", () => {
    expect(isWithinRetreatDates("2026-10-03", "2026-10-13", "2026-10-17")).toBe(false);
    expect(isWithinRetreatDates("2026-10-13", "2026-10-13", "2026-10-17")).toBe(true);
    expect(isWithinRetreatDates("2026-10-17", "2026-10-13", "2026-10-17")).toBe(true);
    expect(isWithinRetreatDates("2026-10-18", "2026-10-13", "2026-10-17")).toBe(false);
    expect(isWithinRetreatDates("2026-10-03", "2026-10-13", null)).toBe(true);
    expect(isWithinRetreatDates("2026-10-03", null, "2026-10-17")).toBe(true);
    expect(isWithinRetreatDates("2026-10-03", null, null)).toBe(true);
    // a reversed stored pair is ignored, like buildRetreatDays does
    expect(isWithinRetreatDates("2026-10-03", "2026-10-17", "2026-10-13")).toBe(true);
  });

  it("counts the activities the guest will not see", () => {
    const items = [{ date: "2026-10-03" }, { date: "2026-10-03" }, { date: "2026-10-14" }];
    expect(countOutsideRetreatDates(items, "2026-10-13", "2026-10-17")).toBe(2);
    expect(countOutsideRetreatDates(items, null, null)).toBe(0);
  });
});

describe("buildRetreatDays - today", () => {
  it("marks today when it is inside the range", () => {
    const r = buildRetreatDays({ activityDates: [], startDate: "2027-10-14", endDate: "2027-10-16", todayIso: "2027-10-15" });
    expect(r.days.map((d) => d.isToday)).toEqual([false, true, false]);
  });

  it("marks nothing when today is outside the range", () => {
    const r = buildRetreatDays({ activityDates: [], startDate: "2027-10-14", endDate: "2027-10-16", todayIso: "2027-11-01" });
    expect(r.days.some((d) => d.isToday)).toBe(false);
  });
});

describe("buildRetreatDays - timezone independence", () => {
  const input = { activityDates: ["2027-03-14", "2027-03-28", "2027-10-31"], startDate: "2027-03-13", endDate: "2027-03-29", todayIso: "2027-03-14" };
  const zones = ["UTC", "America/Los_Angeles", "Pacific/Kiritimati", "Pacific/Pago_Pago", "Europe/Berlin", "Asia/Jerusalem"];

  it("returns the identical list under every process TZ (incl. DST weekends)", () => {
    process.env.TZ = "UTC";
    const reference = buildRetreatDays(input);
    for (const zone of zones) {
      process.env.TZ = zone;
      expect(buildRetreatDays(input), zone).toEqual(reference);
    }
    expect(reference.days[0].date).toBe("2027-03-13");
    expect(reference.days[1].isToday).toBe(true);
  });
});

describe("defaultRetreatDay", () => {
  const { days } = buildRetreatDays({ activityDates: [], startDate: "2027-10-14", endDate: "2027-10-16", todayIso: "2000-01-01" });
  it("prefers today, then the next upcoming day, then the first day", () => {
    expect(defaultRetreatDay(days, "2027-10-15")).toBe("2027-10-15");
    expect(defaultRetreatDay(days, "2027-10-01")).toBe("2027-10-14");
    expect(defaultRetreatDay(days, "2027-12-01")).toBe("2027-10-14");
    expect(defaultRetreatDay([], "2027-12-01")).toBeNull();
  });
});

describe("validateRetreatDates (Studio + server)", () => {
  it("accepts both unset, either one alone, and a valid range", () => {
    expect(validateRetreatDates(null, null)).toBeNull();
    expect(validateRetreatDates("2027-10-14", null)).toBeNull();
    expect(validateRetreatDates(null, "2027-10-14")).toBeNull();
    expect(validateRetreatDates("2027-10-14", "2027-10-14")).toBeNull();
    expect(validateRetreatDates("2027-10-14", "2027-10-19")).toBeNull();
  });

  it("rejects an end before the start", () => {
    expect(validateRetreatDates("2027-10-14", "2027-10-13")).toBe("endBeforeStart");
  });

  it(`limits the range to ${MAX_RETREAT_RANGE_DAYS} days inclusive`, () => {
    const start = "2027-01-01";
    const lastAllowed = "2027-03-01"; // Jan 31 + Feb 28 + 1 = 60 days
    expect(inclusiveDaySpan(start, lastAllowed)).toBe(MAX_RETREAT_RANGE_DAYS);
    expect(validateRetreatDates(start, lastAllowed)).toBeNull();
    expect(validateRetreatDates(start, "2027-03-02")).toBe("rangeTooLong");
  });

  it("rejects malformed or impossible dates", () => {
    expect(validateRetreatDates("2027-02-30", null)).toBe("invalidDate");
    expect(validateRetreatDates(null, "14/10/2027")).toBe("invalidDate");
  });
});
