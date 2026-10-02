import { describe, expect, it } from "vitest";
import { classMetadataSchema, parseTeachItem, type TeachItem } from "./schemas";
import { expandClassOccurrences, expandClassesForWindow, toRRule, upcomingOccurrenceDates, dstConflicts, validateRecurrence } from "./recurrence";
import { recurrenceProblem, recurrenceSummary, repeatPresetOf, validRule } from "./recurrenceText";
import { isInvalidStored } from "./schemas";
import { buildScheduleDays, classesOn, nextUpcomingClass, sortClasses } from "./schedule";
import { parsePublishedTeachSpace } from "./guestData";
import { todayInTimezone } from "@/lib/timezone";

type C = TeachItem<"teachClasses">;
const mk = (id: string, m: Record<string, unknown>, title = id): C => ({
  id,
  title,
  subtitle: null,
  description: null,
  imageRef: null,
  externalLink: null,
  metadata: classMetadataSchema.parse(m),
});
const dates = (cs: C[]) => cs.map((c) => c.metadata.startDate);
const at = (cs: C[]) => cs.map((c) => `${c.metadata.startDate} ${c.metadata.startTime} ${c.metadata.startsAt} ${c.metadata.startOffset}`);

// 2026-10-01 is a Thursday.
describe("rule expansion", () => {
  it("daily", () => {
    const c = mk("d", { startDate: "2026-10-01", startTime: "07:00", timezone: "Asia/Jerusalem", recurrence: { freq: "daily" } });
    expect(dates(expandClassOccurrences(c, "2026-10-01", "2026-10-05", "UTC"))).toEqual(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"]);
  });

  it("weekly on multiple weekdays (Sun + Wed), first occurrence is the first matching day on/after the start", () => {
    const c = mk("w", { startDate: "2026-10-01", startTime: "08:00", endTime: "09:15", timezone: "Asia/Jerusalem", recurrence: { freq: "weekly", byWeekday: [3, 0] } });
    const occ = expandClassOccurrences(c, "2026-10-01", "2026-10-14", "UTC");
    expect(dates(occ)).toEqual(["2026-10-04", "2026-10-07", "2026-10-11", "2026-10-14"]);
    expect(occ.every((o) => o.metadata.startTime === "08:00" && o.metadata.endTime === "09:15")).toBe(true);
  });

  it("weekly with no days chosen repeats on the start date's weekday", () => {
    const c = mk("w1", { startDate: "2026-10-01", startTime: "08:00", timezone: "UTC", recurrence: { freq: "weekly" } });
    expect(dates(expandClassOccurrences(c, "2026-10-01", "2026-10-22", "UTC"))).toEqual(["2026-10-01", "2026-10-08", "2026-10-15", "2026-10-22"]);
  });

  it("every 2 weeks on Monday, ending on a date (inclusive)", () => {
    const c = mk("b", { startDate: "2026-10-05", startTime: "18:00", timezone: "UTC", recurrence: { freq: "weekly", interval: 2, byWeekday: [1], end: { type: "until", until: "2027-12-31" } } });
    expect(dates(expandClassOccurrences(c, "2026-10-01", "2026-11-02", "UTC"))).toEqual(["2026-10-05", "2026-10-19", "2026-11-02"]);
    expect(dates(expandClassOccurrences(c, "2027-12-01", "2028-02-01", "UTC"))).toEqual(["2027-12-13", "2027-12-27"]);
  });

  it("monthly after 12 occurrences", () => {
    const c = mk("m", { startDate: "2026-10-14", startTime: "19:00", timezone: "UTC", recurrence: { freq: "monthly", end: { type: "count", count: 12 } } });
    const occ = expandClassOccurrences(c, "2026-01-01", "2028-12-31", "UTC");
    expect(occ).toHaveLength(12);
    expect(dates(occ)[0]).toBe("2026-10-14");
    expect(dates(occ)[11]).toBe("2027-09-14");
  });

  it("monthly on the 31st skips months without one (RFC 5545) and does not count them", () => {
    const c = mk("m31", { startDate: "2026-10-31", startTime: "10:00", timezone: "UTC", recurrence: { freq: "monthly", end: { type: "count", count: 3 } } });
    expect(dates(expandClassOccurrences(c, "2026-10-01", "2027-12-31", "UTC"))).toEqual(["2026-10-31", "2026-12-31", "2027-01-31"]);
  });

  it("end after a count across several weekdays", () => {
    const c = mk("wc", { startDate: "2026-10-01", startTime: "08:00", timezone: "UTC", recurrence: { freq: "weekly", byWeekday: [0, 3], end: { type: "count", count: 5 } } });
    expect(dates(expandClassOccurrences(c, "2026-01-01", "2027-12-31", "UTC"))).toEqual(["2026-10-04", "2026-10-07", "2026-10-11", "2026-10-14", "2026-10-18"]);
  });

  it("a never-ending series is only expanded for the requested window (cheap even years later)", () => {
    const c = mk("forever", { startDate: "2020-01-01", startTime: "06:00", timezone: "UTC", recurrence: { freq: "daily" } });
    const t0 = performance.now();
    const occ = expandClassOccurrences(c, "2030-06-01", "2030-06-03", "UTC");
    expect(dates(occ)).toEqual(["2030-06-01", "2030-06-02", "2030-06-03"]);
    expect(performance.now() - t0).toBeLessThan(200);
    const weekly = mk("fw", { startDate: "2020-01-06", startTime: "06:00", timezone: "UTC", recurrence: { freq: "weekly", interval: 3, byWeekday: [1] } });
    // 2020-01-06 -> 2030-06-03 is 3801 days = 181 x 21: a 3-week step lands on 06-03 and 06-24.
    expect(dates(expandClassOccurrences(weekly, "2030-06-01", "2030-06-30", "UTC"))).toEqual(["2030-06-03", "2030-06-24"]);
  });

  it("dates before the series start never appear", () => {
    const c = mk("late", { startDate: "2026-10-14", startTime: "06:00", timezone: "UTC", recurrence: { freq: "daily" } });
    expect(dates(expandClassOccurrences(c, "2026-10-10", "2026-10-15", "UTC"))).toEqual(["2026-10-14", "2026-10-15"]);
  });
});

describe("local wall time is preserved across DST (never fixed UTC steps)", () => {
  it("Europe/London 09:00 stays 09:00 local across the October change", () => {
    const c = mk("lon", { startDate: "2026-10-18", startTime: "09:00", timezone: "Europe/London", recurrence: { freq: "weekly", byWeekday: [0] } });
    expect(at(expandClassOccurrences(c, "2026-10-18", "2026-10-25", "UTC"))).toEqual([
      "2026-10-18 09:00 2026-10-18T08:00:00Z +01:00",
      "2026-10-25 09:00 2026-10-25T09:00:00Z +00:00",
    ]);
  });

  it("America/New_York 09:00 stays 09:00 local across 1 Nov", () => {
    const c = mk("ny", { startDate: "2026-10-31", startTime: "09:00", timezone: "America/New_York", recurrence: { freq: "daily" } });
    expect(at(expandClassOccurrences(c, "2026-10-31", "2026-11-01", "UTC"))).toEqual([
      "2026-10-31 09:00 2026-10-31T13:00:00Z -04:00",
      "2026-11-01 09:00 2026-11-01T14:00:00Z -05:00",
    ]);
  });

  it("DST spring-forward: a nonexistent local time is NEVER generated or moved; it is reported instead", () => {
    const c = mk("gap", { startDate: "2027-03-07", startTime: "02:30", endTime: "03:30", timezone: "America/New_York", recurrence: { freq: "weekly", byWeekday: [0] } });
    const before = JSON.stringify(c.metadata);
    const occ = expandClassOccurrences(c, "2027-03-07", "2027-03-21", "UTC");
    expect(at(occ)).toEqual(["2027-03-07 02:30 2027-03-07T07:30:00Z -05:00", "2027-03-21 02:30 2027-03-21T06:30:00Z -04:00"]);
    // Nothing at all on the gap day - in particular no 03:30 class.
    expect(occ.some((o) => o.metadata.startDate === "2027-03-14" || o.metadata.occurrence?.originalDate === "2027-03-14")).toBe(false);
    expect(occ.some((o) => o.metadata.startTime === "03:30")).toBe(false);
    expect(dstConflicts(c.metadata, "2027-03-01", "2027-04-01", "America/New_York")).toEqual([{ originalDate: "2027-03-14", date: "2027-03-14", time: "02:30", field: "start" }]);
    expect(JSON.stringify(c.metadata)).toBe(before); // the series itself is untouched
  });

  it("an END time inside the gap also blocks that occurrence (never shortened or shifted)", () => {
    const c = mk("gapEnd", { startDate: "2027-03-07", startTime: "01:30", endTime: "02:30", timezone: "America/New_York", recurrence: { freq: "weekly", byWeekday: [0] } });
    expect(dates(expandClassOccurrences(c, "2027-03-07", "2027-03-21", "UTC"))).toEqual(["2027-03-07", "2027-03-21"]);
    expect(dstConflicts(c.metadata, "2027-03-01", "2027-04-01", "America/New_York")).toEqual([{ originalDate: "2027-03-14", date: "2027-03-14", time: "02:30", field: "end" }]);
  });

  it("the teacher resolves a gap date with an exception: cancel it, or move just that date", () => {
    const base = { startDate: "2027-03-07", startTime: "02:30", endTime: "03:30", timezone: "America/New_York", recurrence: { freq: "weekly", byWeekday: [0] } };
    const cancelled = mk("g1", { ...base, exceptions: { "2027-03-14": { cancelled: true } } });
    expect(dstConflicts(cancelled.metadata, "2027-03-01", "2027-04-01", "America/New_York")).toEqual([]);
    expect(dates(expandClassOccurrences(cancelled, "2027-03-07", "2027-03-21", "UTC"))).toEqual(["2027-03-07", "2027-03-21"]);
    const moved = mk("g2", { ...base, exceptions: { "2027-03-14": { startTime: "03:30", endTime: "04:30" } } });
    expect(dstConflicts(moved.metadata, "2027-03-01", "2027-04-01", "America/New_York")).toEqual([]);
    expect(at(expandClassOccurrences(moved, "2027-03-14", "2027-03-14", "UTC"))).toEqual(["2027-03-14 03:30 2027-03-14T07:30:00Z -04:00"]);
    expect(validateRecurrence(moved.metadata, "UTC")).toBeNull();
    // Unresolved gaps are a warning, not a save error; a teacher-entered time in the gap IS an error.
    expect(validateRecurrence(mk("g3", base).metadata, "UTC")).toBeNull();
    expect(validateRecurrence(mk("g4", { ...base, exceptions: { "2027-03-14": { startTime: "02:45", endTime: "04:00" } } }).metadata, "UTC")?.message).toMatch(/doesn’t exist/);
  });

  it("DST fall-back: an ambiguous time uses the earlier instant and is flagged", () => {
    const c = mk("fb", { startDate: "2026-10-25", startTime: "01:30", timezone: "America/New_York", recurrence: { freq: "weekly", byWeekday: [0] } });
    const occ = expandClassOccurrences(c, "2026-10-25", "2026-11-08", "UTC");
    expect(at(occ).slice(1)).toEqual(["2026-11-01 01:30 2026-11-01T05:30:00Z -04:00", "2026-11-08 01:30 2026-11-08T06:30:00Z -05:00"]);
    expect(occ[1].metadata.startAmbiguous).toBe(true);
    expect(occ[2].metadata.startAmbiguous).toBe(false);
  });

  it("Asia/Bangkok (no DST) is a constant +07:00", () => {
    const c = mk("bkk", { startDate: "2026-10-04", startTime: "07:00", timezone: "Asia/Bangkok", recurrence: { freq: "weekly", byWeekday: [0] } });
    const occ = expandClassOccurrences(c, "2026-10-01", "2027-04-30", "UTC");
    expect(occ.length).toBe(30);
    expect(occ.every((o) => o.metadata.startOffset === "+07:00" && o.metadata.startsAt?.endsWith("T00:00:00Z"))).toBe(true);
  });
});

describe("exceptions", () => {
  const base = { startDate: "2026-10-04", startTime: "08:00", endTime: "09:15", location: "Studio A", timezone: "Asia/Jerusalem", recurrence: { freq: "weekly", byWeekday: [0], end: { type: "count", count: 4 } } };
  it("cancelling one occurrence removes only it; COUNT still counts it", () => {
    const c = mk("x", { ...base, exceptions: { "2026-10-11": { cancelled: true } } });
    expect(dates(expandClassOccurrences(c, "2026-10-01", "2026-12-31", "UTC"))).toEqual(["2026-10-04", "2026-10-18", "2026-10-25"]);
  });
  it("an occurrence can be moved and re-located; others keep the series details", () => {
    const c = mk("x", { ...base, exceptions: { "2026-10-11": { startDate: "2026-10-12", startTime: "18:00", endTime: "19:00", location: "Beach" } } });
    const occ = expandClassOccurrences(c, "2026-10-01", "2026-12-31", "UTC");
    const moved = occ.find((o) => o.metadata.occurrence?.originalDate === "2026-10-11")!;
    expect([moved.metadata.startDate, moved.metadata.startTime, moved.metadata.endTime, moved.metadata.location]).toEqual(["2026-10-12", "18:00", "19:00", "Beach"]);
    expect(moved.metadata.startsAt).toBe("2026-10-12T15:00:00Z");
    expect(occ.filter((o) => o !== moved).every((o) => o.metadata.location === "Studio A" && o.metadata.startTime === "08:00")).toBe(true);
  });
  it("occurrence ids are stable and unique per original date", () => {
    const occ = expandClassOccurrences(mk("x", base), "2026-10-01", "2026-12-31", "UTC");
    expect(occ.map((o) => o.id)).toEqual(["x__2026-10-04", "x__2026-10-11", "x__2026-10-18", "x__2026-10-25"]);
  });
  it("validation rejects an end date before the start and a moved occurrence in a DST gap", () => {
    expect(validateRecurrence(classMetadataSchema.parse({ ...base, recurrence: { freq: "daily", end: { type: "until", until: "2026-10-01" } } }), "UTC")?.message).toMatch(/before the first class/);
    expect(validateRecurrence(classMetadataSchema.parse({ ...base, timezone: "America/New_York", exceptions: { "2027-03-14": { startTime: "02:30" } } }), "UTC")?.message).toMatch(/doesn’t exist/);
    expect(validateRecurrence(classMetadataSchema.parse(base), "UTC")).toBeNull();
  });
});

describe("schedule integration", () => {
  const tlv = "Asia/Jerusalem";
  const series = mk("vin", { startDate: "2026-10-01", startTime: "08:00", endTime: "09:15", timezone: tlv, recurrence: { freq: "weekly", byWeekday: [0, 3] } }, "Morning Vinyasa");
  const oneOff = mk("yin", { startDate: "2026-10-04", startTime: "07:00", endTime: "08:00", timezone: tlv }, "Sunrise Yin");
  const ny = mk("ny", { startDate: "2026-10-04", startTime: "02:00", timezone: "America/New_York", recurrence: { freq: "weekly", byWeekday: [0] } }, "Online");
  const all = expandClassesForWindow([series, oneOff, ny], "2026-10-01", "2026-10-31", tlv);

  it("Today's Classes: occurrences appear on their day, ordered by canonical instant, no duplicates", () => {
    const today = classesOn(all, "2026-10-04", tlv);
    // NY 02:00 EDT = 06:00Z = 09:00 Jerusalem; Yin 07:00 (04:00Z); Vinyasa 08:00 (05:00Z).
    expect(today.map((c) => c.title)).toEqual(["Sunrise Yin", "Morning Vinyasa", "Online"]);
    expect(new Set(today.map((c) => c.id)).size).toBe(today.length);
  });

  it("Schedule: 14-day strip counts each generated occurrence once", () => {
    const days = buildScheduleDays(all, [], "2026-10-01", 14, tlv);
    const counts = Object.fromEntries(days.map((d) => [d.date, d.classCount]));
    expect([counts["2026-10-04"], counts["2026-10-07"], counts["2026-10-08"], counts["2026-10-11"]]).toEqual([3, 1, 0, 2]);
  });

  it("ordering across series uses each occurrence's own instant", () => {
    const ids = sortClasses(classesOn(all, "2026-10-11", tlv)).map((c) => c.id);
    expect(ids).toEqual(["vin__2026-10-11", "ny__2026-10-11"]);
    expect(nextUpcomingClass(all, "2026-10-08", tlv)?.id).toBe("vin__2026-10-11");
  });

  it("a class without recurrence is returned exactly as before", () => {
    expect(expandClassOccurrences(oneOff, "2026-10-01", "2026-10-31", tlv)).toEqual([oneOff]);
    const legacy = mk("old", { startDate: "2026-10-04", startTime: "07:00" });
    const [out] = expandClassesForWindow([legacy], "2026-10-01", "2026-10-31", tlv);
    expect(out.metadata.recurrence).toBeNull();
    expect(out.metadata.startsAt).toBe("2026-10-04T04:00:00Z"); // derived in the Space zone, as before
  });
});

describe("stored data and backward compatibility", () => {
  it("existing one-off rows parse with no recurrence and empty exceptions", () => {
    const row = parseTeachItem("teachClasses", { id: "c", title: "Flow", metadata: { startDate: "2025-10-14", startTime: "07:30", timezone: "Asia/Jerusalem" } });
    expect(row?.metadata.recurrence).toBeNull();
    expect(row?.metadata.exceptions).toEqual({});
    expect(row?.metadata.occurrence).toBeNull();
    expect(recurrenceProblem(row!.metadata)).toBeNull();
    expect(expandClassOccurrences(row!, "2025-10-01", "2025-10-31", "UTC")).toEqual([row]);
  });
  it("malformed recurrence is preserved verbatim and flagged - never reinterpreted as a one-off", () => {
    const raw = { freq: "hourly", interval: 3 };
    const row = parseTeachItem("teachClasses", { id: "c", title: "Flow", metadata: { startDate: "2025-10-14", startTime: "07:30", recurrence: raw } });
    expect(row).not.toBeNull(); // the row is kept (Guest App and Studio stay safe)
    expect(isInvalidStored(row!.metadata.recurrence)).toBe(true);
    expect((row!.metadata.recurrence as { raw: unknown }).raw).toEqual(raw);
    expect(validRule(row!.metadata)).toBeNull();
    expect(recurrenceProblem(row!.metadata)).toEqual({ recurrence: true, exceptions: false });
    // Not shown as a one-off at its start date (or anywhere).
    expect(expandClassOccurrences(row!, "2025-01-01", "2030-12-31", "UTC")).toEqual([]);
  });

  it("partly wrong values make the rule invalid instead of being quietly 'fixed'", () => {
    for (const bad of [{ freq: "weekly", interval: 0 }, { freq: "weekly", byWeekday: [9] }, { freq: "daily", end: { type: "count", count: -1 } }, "weekly", 42]) {
      const m = classMetadataSchema.parse({ startDate: "2026-10-01", startTime: "08:00", recurrence: bad });
      expect(isInvalidStored(m.recurrence), JSON.stringify(bad)).toBe(true);
    }
  });

  it("malformed exceptions are preserved and hide the series (a cancelled date must not reappear)", () => {
    const rawEx = { "2026-10-11": { cancelled: "yes" } };
    const c = mk("e", { startDate: "2026-10-04", startTime: "08:00", timezone: "UTC", recurrence: { freq: "weekly", byWeekday: [0] }, exceptions: rawEx });
    expect(isInvalidStored(c.metadata.exceptions)).toBe(true);
    expect((c.metadata.exceptions as unknown as { raw: unknown }).raw).toEqual(rawEx);
    expect(recurrenceProblem(c.metadata)).toEqual({ recurrence: false, exceptions: true });
    expect(expandClassOccurrences(c, "2026-10-01", "2026-10-31", "UTC")).toEqual([]);
  });

  it("a marker sent back by the Studio is re-read from its raw value (no nesting, repairs take effect)", () => {
    const once = classMetadataSchema.parse({ startDate: "2026-10-01", startTime: "08:00", recurrence: { freq: "x" } });
    const twice = classMetadataSchema.parse({ startDate: "2026-10-01", startTime: "08:00", recurrence: once.recurrence });
    expect(twice.recurrence).toEqual({ status: "invalid", raw: { freq: "x" } });
  });

  it("legitimate weekdays are only de-duplicated and ordered", () => {
    const m = classMetadataSchema.parse({ startDate: "2026-10-01", startTime: "08:00", recurrence: { freq: "weekly", byWeekday: [3, 0, 3] } });
    expect(m.recurrence).toEqual({ freq: "weekly", interval: 1, byWeekday: [0, 3], end: { type: "never" } });
  });

  it("the Guest App stays safe: a damaged series is skipped, other classes still render", () => {
    const tz = "Asia/Jerusalem";
    const today = todayInTimezone(tz);
    const space = {
      name: "Maya",
      timezone: tz,
      theme: {},
      enabled_modules: [],
      modules: { teach: { settings: {}, items: { teachClasses: [
        { id: "bad", title: "Broken", metadata: { startDate: today, startTime: "06:00", timezone: tz, recurrence: { freq: "sometimes" } } },
        { id: "ok", title: "One-off", metadata: { startDate: today, startTime: "07:00", timezone: tz } },
      ] } } },
    };
    const data = parsePublishedTeachSpace(space as never);
    expect(data.classes.map((c) => c.id)).toEqual(["ok"]);
  });
});

describe("human text and RRULE export", () => {
  const r = (x: Record<string, unknown>) => validRule(classMetadataSchema.parse({ startDate: "2026-10-05", startTime: "08:00", recurrence: x }))!;
  it("summaries", () => {
    expect(recurrenceSummary(r({ freq: "weekly", byWeekday: [0, 3] }), "2026-10-05")).toBe("Every week on Sun, Wed · No end date");
    expect(recurrenceSummary(r({ freq: "weekly", interval: 2, byWeekday: [1], end: { type: "until", until: "2027-12-31" } }), "2026-10-05")).toBe("Every 2 weeks on Mon · Until 31 Dec 2027");
    expect(recurrenceSummary(r({ freq: "monthly", end: { type: "count", count: 12 } }), "2026-10-05")).toBe("Every month on the 5th · 12 times");
    expect(recurrenceSummary(r({ freq: "daily" }), "2026-10-05")).toBe("Every day · No end date");
  });
  it("Studio presets never expose raw rules", () => {
    expect([repeatPresetOf(null), repeatPresetOf(r({ freq: "weekly" })), repeatPresetOf(r({ freq: "weekly", interval: 2 }))]).toEqual(["none", "weekly", "custom"]);
  });
  it("RRULE text is RFC 5545 compatible (UNTIL in UTC)", () => {
    expect(toRRule(r({ freq: "weekly", interval: 2, byWeekday: [1], end: { type: "until", until: "2027-12-31" } }), "2026-10-05", "Europe/London")).toBe("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO;UNTIL=20271231T235959Z;WKST=MO");
    expect(toRRule(r({ freq: "monthly", end: { type: "count", count: 12 } }), "2026-10-14", "UTC")).toBe("FREQ=MONTHLY;BYMONTHDAY=14;COUNT=12;WKST=MO");
  });
  it("upcoming dates for the Studio list", () => {
    const m = classMetadataSchema.parse({ startDate: "2026-10-01", startTime: "08:00", recurrence: { freq: "weekly", byWeekday: [0, 3] } });
    expect(upcomingOccurrenceDates(m, "2026-10-08", 3)).toEqual(["2026-10-11", "2026-10-14", "2026-10-18"]);
  });
});

describe("published guest data expands series server-side", () => {
  it("parsePublishedTeachSpace turns a stored series into dated occurrences around today", () => {
    const tz = "Asia/Jerusalem";
    const today = todayInTimezone(tz);
    const space = {
      name: "Maya",
      timezone: tz,
      theme: {},
      enabled_modules: [],
      modules: { teach: { settings: {}, items: { teachClasses: [{ id: "s", title: "Daily Breath", metadata: { startDate: today, startTime: "06:00", timezone: tz, recurrence: { freq: "daily" } } }] } } },
    };
    const data = parsePublishedTeachSpace(space as never);
    expect(classesOn(data.classes, today, tz).map((c) => c.id)).toEqual([`s__${today}`]);
    expect(data.classes.length).toBeGreaterThan(50); // bounded window, not "forever"
    expect(data.classes.length).toBeLessThan(70);
    expect(data.classes.every((c) => c.metadata.occurrence?.seriesId === "s")).toBe(true);
  });
});
