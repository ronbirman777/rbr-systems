import { Temporal } from "temporal-polyfill";
import type { ClassMetadata, Recurrence, TeachItem } from "./schemas";
import { effectiveWeekdays } from "./recurrenceText";
import { isValidTimeZone, resolveLocalTime, withDerivedClassTimes } from "./classTime";

/**
 * Recurring classes: one stored series, occurrences expanded on demand.
 *
 * Model (see schemas.ts "Recurring classes"):
 *  - The class row IS the series. Its startDate/startTime/endTime/timezone
 *    are the series start (DTSTART) and each occurrence's local wall time.
 *  - `recurrence` is an RFC 5545 RRULE subset: FREQ=DAILY|WEEKLY|MONTHLY,
 *    INTERVAL, BYDAY (weekly), UNTIL (inclusive local date), COUNT, with
 *    WKST=MO. Monthly repeats on the start date's day of month; months that
 *    don't have that day are skipped and not counted (RFC 5545 behaviour).
 *  - Occurrences are dates on or after the series start that match the
 *    rule. COUNT counts generated occurrences, including cancelled ones
 *    (iCalendar: EXDATE removes, it does not extend the series).
 *  - `exceptions[originalDate]` cancels or overrides one occurrence.
 *
 * Wall time is preserved across DST: every occurrence is resolved from its
 * own LOCAL date + time in the class's zone with Temporal - never by adding
 * fixed UTC durations. A local time that falls in a DST gap is shifted
 * forward by the gap (RFC 5545 / Temporal "compatible"); one that happens
 * twice uses the earlier instant, matching single classes.
 *
 * Server + Studio only (it imports Temporal); the Guest App receives
 * already-expanded occurrences from parsePublishedTeachSpace.
 */

const MAX_ITERATIONS = 5000;
/** Expansion margin so occurrences moved by an exception are still found. */
const MOVE_MARGIN_DAYS = 45;

type TeachClass = TeachItem<"teachClasses">;
const PD = (iso: string) => Temporal.PlainDate.from(iso);
const iso = (d: Temporal.PlainDate) => d.toString();

/**
 * Dates of a rule's occurrences, in order, before exceptions are applied.
 * Generic over anything with a start date + rule (no class fields), so
 * Private Availability windows can adopt the same engine later.
 */
export function* ruleDates(rule: Recurrence, startIso: string, fromIso: string): Generator<string> {
  const start = PD(startIso);
  const until = rule.end.type === "until" ? PD(rule.end.until) : null;
  const countLimit = rule.end.type === "count" ? rule.end.count : Infinity;
  // With COUNT we must walk from the start (the count is positional).
  // Otherwise jump close to the window so "never ends" stays cheap.
  const from = countLimit === Infinity ? PD(fromIso) : start;
  let emitted = 0;
  let iterations = 0;
  const emit = (d: Temporal.PlainDate): "stop" | "skip" | "ok" => {
    if (until && Temporal.PlainDate.compare(d, until) > 0) return "stop";
    if (Temporal.PlainDate.compare(d, start) < 0) return "skip";
    return "ok";
  };

  if (rule.freq === "daily") {
    const skip = Math.max(0, Math.floor(start.until(from, { largestUnit: "days" }).days / rule.interval));
    for (let k = skip; iterations++ < MAX_ITERATIONS && emitted < countLimit; k++) {
      const d = start.add({ days: k * rule.interval });
      const r = emit(d);
      if (r === "stop") return;
      if (r === "ok") {
        emitted++;
        yield iso(d);
      }
    }
    return;
  }

  if (rule.freq === "weekly") {
    // WKST=MO: weeks start on Monday; INTERVAL counts weeks from the start's week.
    const days = effectiveWeekdays(rule, startIso)
      .map((wd) => (wd + 6) % 7)
      .sort((a, b) => a - b);
    const anchor = start.subtract({ days: (start.dayOfWeek + 6) % 7 }); // Monday of the start week
    const weeksToFrom = Math.max(0, Math.floor(anchor.until(from, { largestUnit: "days" }).days / 7));
    for (let w = weeksToFrom - (weeksToFrom % rule.interval); iterations++ < MAX_ITERATIONS && emitted < countLimit; w += rule.interval) {
      for (const offset of days) {
        const d = anchor.add({ days: w * 7 + offset });
        const r = emit(d);
        if (r === "stop") return;
        if (r === "skip") continue;
        emitted++;
        yield iso(d);
        if (emitted >= countLimit) return;
      }
    }
    return;
  }

  // monthly: the start's day of month; months without it are skipped (not counted).
  const startMonth = Temporal.PlainYearMonth.from({ year: start.year, month: start.month });
  const monthsToFrom = Math.max(0, startMonth.until(Temporal.PlainYearMonth.from({ year: from.year, month: from.month }), { largestUnit: "months" }).months);
  for (let m = monthsToFrom - (monthsToFrom % rule.interval); iterations++ < MAX_ITERATIONS && emitted < countLimit; m += rule.interval) {
    const ym = startMonth.add({ months: m });
    let d: Temporal.PlainDate;
    try {
      d = Temporal.PlainDate.from({ year: ym.year, month: ym.month, day: start.day }, { overflow: "reject" });
    } catch {
      continue; // e.g. the 31st in a 30-day month
    }
    const r = emit(d);
    if (r === "stop") return;
    if (r === "ok") {
      emitted++;
      yield iso(d);
    }
  }
}

/** Resolve one occurrence's local wall time; DST gaps shift forward, overlaps use the earlier instant. */
export function resolveOccurrenceTime(dateIso: string, time: string, timeZone: string) {
  const pdt = Temporal.PlainDateTime.from(`${dateIso}T${time}`);
  const zdt = pdt.toZonedDateTime(timeZone, { disambiguation: "compatible" });
  const later = pdt.toZonedDateTime(timeZone, { disambiguation: "later" });
  const wall = zdt.toPlainDateTime();
  return {
    instant: zdt.toInstant().toString(),
    offset: zdt.offset,
    /** Effective local date/time (differs from the request only in a DST gap). */
    date: wall.toPlainDate().toString(),
    time: wall.toPlainTime().toString({ smallestUnit: "minute" }),
    shifted: !wall.equals(pdt),
    ambiguous: zdt.epochNanoseconds !== later.epochNanoseconds && wall.equals(pdt),
  };
}

function spanDays(meta: ClassMetadata): number {
  if (!meta.endDate || meta.endDate <= meta.startDate) return 0;
  return PD(meta.startDate).until(PD(meta.endDate), { largestUnit: "days" }).days;
}

/**
 * The occurrences of one class that touch [fromDate, toDate] (local dates,
 * inclusive). A class with no recurrence is returned unchanged - one-off
 * classes behave exactly as before.
 */
export function expandClassOccurrences(item: TeachClass, fromDate: string, toDate: string, fallbackTimeZone: string): TeachClass[] {
  const meta = item.metadata;
  if (!meta.recurrence) return [item];
  const tz = meta.timezone && isValidTimeZone(meta.timezone) ? meta.timezone : fallbackTimeZone;
  const span = spanDays(meta);
  const baseFrom = iso(PD(fromDate).subtract({ days: span + MOVE_MARGIN_DAYS }));
  const baseTo = PD(toDate).add({ days: MOVE_MARGIN_DAYS });
  const out: TeachClass[] = [];

  for (const originalDate of ruleDates(meta.recurrence, meta.startDate, baseFrom)) {
    if (Temporal.PlainDate.compare(PD(originalDate), baseTo) > 0) break;
    const ex = meta.exceptions[originalDate];
    if (ex?.cancelled) continue;
    const startDate = ex?.startDate ?? originalDate;
    const startTime = ex?.startTime ?? meta.startTime;
    const endTime = ex?.endTime ?? meta.endTime;
    const start = resolveOccurrenceTime(startDate, startTime, tz);
    const endDate = iso(PD(start.date).add({ days: span }));
    const end = endTime ? resolveOccurrenceTime(endDate, endTime, tz) : null;
    const lastDate = end ? end.date : start.date;
    if (lastDate < fromDate || start.date > toDate) continue;
    const endsAt = end && Date.parse(end.instant) > Date.parse(start.instant) ? end : null;

    out.push({
      ...item,
      id: `${item.id}__${originalDate}`,
      metadata: {
        ...meta,
        startDate: start.date,
        startTime: start.time,
        endDate: span > 0 ? (endsAt?.date ?? endDate) : null,
        endTime: endsAt ? endsAt.time : null,
        location: ex?.location ?? meta.location,
        timezone: tz,
        startsAt: start.instant,
        endsAt: endsAt?.instant ?? null,
        startOffset: start.offset,
        endOffset: endsAt?.offset ?? null,
        startAmbiguous: start.ambiguous,
        endAmbiguous: endsAt?.ambiguous ?? false,
        exceptions: {},
        occurrence: { seriesId: item.id, originalDate, dstShifted: start.shifted || Boolean(end?.shifted) },
      },
    });
  }
  return out;
}

/**
 * Every class as the Schedule should see it for a window: one-off classes
 * as they are (with derived instants for pre-model rows), recurring series
 * replaced by their occurrences in the window.
 */
export function expandClassesForWindow(classes: TeachClass[], fromDate: string, toDate: string, spaceTimeZone: string): TeachClass[] {
  return classes.flatMap((c) =>
    c.metadata.recurrence ? expandClassOccurrences(c, fromDate, toDate, spaceTimeZone) : [{ ...c, metadata: withDerivedClassTimes(c.metadata, spaceTimeZone) }]
  );
}

/** Guest/preview window around "today": enough for Today, the 14-day Schedule and "Next class" hints. */
export const GUEST_WINDOW = { pastDays: 2, futureDays: 62 } as const;
export function guestWindow(todayIso: string): [string, string] {
  const t = PD(todayIso);
  return [iso(t.subtract({ days: GUEST_WINDOW.pastDays })), iso(t.add({ days: GUEST_WINDOW.futureDays }))];
}

/** The next `limit` occurrence dates from `fromDate` (Studio preview list), including cancelled ones. */
export function upcomingOccurrenceDates(meta: ClassMetadata, fromDate: string, limit: number): string[] {
  if (!meta.recurrence) return [];
  const out: string[] = [];
  for (const d of ruleDates(meta.recurrence, meta.startDate, fromDate)) {
    if (d < fromDate) continue;
    out.push(d);
    if (out.length >= limit) break;
  }
  return out;
}

/** Local dates where the series' wall time falls in a DST gap (shown as Studio notes). */
export function dstShiftedDates(meta: ClassMetadata, fromDate: string, toDate: string, timeZone: string): string[] {
  if (!meta.recurrence) return [];
  const out: string[] = [];
  for (const d of ruleDates(meta.recurrence, meta.startDate, fromDate)) {
    if (d > toDate) break;
    if (d < fromDate || meta.exceptions[d]?.cancelled) continue;
    if (resolveOccurrenceTime(d, meta.exceptions[d]?.startTime ?? meta.startTime, timeZone).shifted) out.push(d);
  }
  return out;
}

export type RecurrenceIssue = { message: string };

/** Save-time validation of a series (the series start itself is checked by computeClassTimes). */
export function validateRecurrence(meta: ClassMetadata, fallbackTimeZone: string): RecurrenceIssue | null {
  const rule = meta.recurrence;
  if (!rule) return null;
  if (rule.end.type === "until" && rule.end.until < meta.startDate) return { message: "The repeat end date is before the first class." };
  const tz = meta.timezone ?? fallbackTimeZone;
  for (const [date, ex] of Object.entries(meta.exceptions)) {
    if (ex.cancelled) continue;
    const d = ex.startDate ?? date;
    const t = ex.startTime ?? meta.startTime;
    const r = resolveLocalTime(d, t, tz);
    if (!r.ok && r.reason === "nonexistent") return { message: `The changed class on ${date} starts at ${t}, which doesn’t exist on ${d} in ${tz} (the clocks move forward).` };
  }
  return null;
}

/**
 * RFC 5545 RRULE text for a series - for future calendar export only; the
 * Studio never shows or edits it. UNTIL is the end of the local until-date,
 * expressed in UTC as RFC 5545 requires when DTSTART carries a TZID.
 */
export function toRRule(rule: Recurrence, startDate: string, timeZone: string): string {
  const parts = [`FREQ=${rule.freq.toUpperCase()}`];
  if (rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.freq === "weekly") parts.push(`BYDAY=${effectiveWeekdays(rule, startDate).map((d) => ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][d]).join(",")}`);
  if (rule.freq === "monthly") parts.push(`BYMONTHDAY=${Number(startDate.slice(8, 10))}`);
  if (rule.end.type === "count") parts.push(`COUNT=${rule.end.count}`);
  if (rule.end.type === "until") {
    const endOfDay = Temporal.PlainDateTime.from(`${rule.end.until}T23:59:59`).toZonedDateTime(timeZone, { disambiguation: "compatible" });
    parts.push(`UNTIL=${endOfDay.toInstant().toString().replace(/[-:]/g, "").replace(/\.\d+/, "")}`);
  }
  parts.push("WKST=MO");
  return parts.join(";");
}
