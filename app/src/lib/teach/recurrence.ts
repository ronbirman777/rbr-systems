import { Temporal } from "temporal-polyfill";
import type { ClassMetadata, Recurrence, TeachItem } from "./schemas";
import { effectiveWeekdays, validExceptions, validRule } from "./recurrenceText";
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
 * fixed UTC durations. Same canonical-time rules as single classes
 * (classTime.ts):
 *  - a local time that does NOT exist on a date (DST gap) is invalid: that
 *    occurrence is NOT generated - never silently moved to another time.
 *    dstConflicts() reports it so the Studio can ask the teacher to move or
 *    cancel that one date (an exception); the series itself is unchanged.
 *  - a local time that happens twice (DST overlap) uses the earlier instant,
 *    flagged as ambiguous.
 *
 * Malformed stored rules/exceptions (InvalidStored) are never reinterpreted:
 * such a series yields no occurrences and the Studio flags it for repair.
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

export type DstConflict = {
  /** The occurrence's original date (the exception key used to fix it). */
  originalDate: string;
  /** The local date/time that does not exist. */
  date: string;
  time: string;
  field: "start" | "end";
};

type Effective = { startDate: string; startTime: string; endDate: string; endTime: string | null; location: string | null };

/** One occurrence's local date/times after its exception (if any) is applied. */
function effectiveOccurrence(meta: ClassMetadata, originalDate: string, span: number): Effective {
  const ex = validExceptions(meta)[originalDate];
  const startDate = ex?.startDate ?? originalDate;
  return {
    startDate,
    startTime: ex?.startTime ?? meta.startTime,
    endDate: iso(PD(startDate).add({ days: span })),
    endTime: ex?.endTime ?? meta.endTime,
    location: ex?.location ?? meta.location,
  };
}

/** Local start/end that fall in a DST gap for this occurrence (empty = valid). */
function gapsOf(originalDate: string, e: Effective, tz: string): DstConflict[] {
  const out: DstConflict[] = [];
  const s = resolveLocalTime(e.startDate, e.startTime, tz);
  if (!s.ok && s.reason === "nonexistent") out.push({ originalDate, date: e.startDate, time: e.startTime, field: "start" });
  if (e.endTime) {
    const en = resolveLocalTime(e.endDate, e.endTime, tz);
    if (!en.ok && en.reason === "nonexistent") out.push({ originalDate, date: e.endDate, time: e.endTime, field: "end" });
  }
  return out;
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
  if (meta.recurrence === null) return [item]; // one-off class: unchanged
  const rule = validRule(meta);
  // Malformed stored rule or exceptions: show nothing rather than guess
  // (a one-off at the start date, or cancelled dates reappearing).
  if (!rule || validExceptions(meta) !== meta.exceptions) return [];
  const tz = meta.timezone && isValidTimeZone(meta.timezone) ? meta.timezone : fallbackTimeZone;
  const span = spanDays(meta);
  const baseFrom = iso(PD(fromDate).subtract({ days: span + MOVE_MARGIN_DAYS }));
  const baseTo = PD(toDate).add({ days: MOVE_MARGIN_DAYS });
  const exceptions = validExceptions(meta);
  const out: TeachClass[] = [];

  for (const originalDate of ruleDates(rule, meta.startDate, baseFrom)) {
    if (Temporal.PlainDate.compare(PD(originalDate), baseTo) > 0) break;
    if (exceptions[originalDate]?.cancelled) continue;
    const e = effectiveOccurrence(meta, originalDate, span);
    const start = resolveLocalTime(e.startDate, e.startTime, tz);
    const end = e.endTime ? resolveLocalTime(e.endDate, e.endTime, tz) : null;
    // A nonexistent local time is invalid: never generate a shifted class.
    if (!start.ok || (end && !end.ok)) continue;
    const lastDate = end ? e.endDate : e.startDate;
    if (lastDate < fromDate || e.startDate > toDate) continue;
    const endOk = end && end.ok && Date.parse(end.instant) > Date.parse(start.instant) ? end : null;

    out.push({
      ...item,
      id: `${item.id}__${originalDate}`,
      metadata: {
        ...meta,
        startDate: e.startDate,
        startTime: e.startTime,
        endDate: span > 0 && endOk ? e.endDate : null,
        endTime: endOk ? e.endTime : null,
        location: e.location,
        timezone: tz,
        startsAt: start.instant,
        endsAt: endOk ? endOk.instant : null,
        startOffset: start.offset,
        endOffset: endOk ? endOk.offset : null,
        startAmbiguous: start.ambiguous,
        endAmbiguous: endOk ? endOk.ambiguous : false,
        exceptions: {},
        occurrence: { seriesId: item.id, originalDate },
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
  const rule = validRule(meta);
  if (!rule) return [];
  const out: string[] = [];
  for (const d of ruleDates(rule, meta.startDate, fromDate)) {
    if (d < fromDate) continue;
    out.push(d);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Occurrences in [fromDate, toDate] whose local start or end time does not
 * exist (DST gap) and that the teacher has not yet resolved by moving or
 * cancelling that date. These occurrences are not shown to guests.
 */
export function dstConflicts(meta: ClassMetadata, fromDate: string, toDate: string, timeZone: string): DstConflict[] {
  const rule = validRule(meta);
  if (!rule) return [];
  const span = spanDays(meta);
  const exceptions = validExceptions(meta);
  const out: DstConflict[] = [];
  for (const d of ruleDates(rule, meta.startDate, fromDate)) {
    if (d > toDate) break;
    if (d < fromDate || exceptions[d]?.cancelled) continue;
    out.push(...gapsOf(d, effectiveOccurrence(meta, d, span), timeZone));
  }
  return out;
}

export type RecurrenceIssue = { message: string };

/** Save-time validation of a series (the series start itself is checked by computeClassTimes). */
export function validateRecurrence(meta: ClassMetadata, fallbackTimeZone: string): RecurrenceIssue | null {
  const rule = validRule(meta);
  if (!rule) return null; // none, or malformed (preserved and flagged, not rejected)
  if (rule.end.type === "until" && rule.end.until < meta.startDate) return { message: "The repeat end date is before the first class." };
  const tz = meta.timezone ?? fallbackTimeZone;
  const span = spanDays(meta);
  for (const [date, ex] of Object.entries(validExceptions(meta))) {
    if (ex.cancelled || (!ex.startDate && !ex.startTime && !ex.endTime)) continue;
    // A teacher-entered change must itself be a real local time.
    const [gap] = gapsOf(date, effectiveOccurrence(meta, date, span), tz);
    if (gap) return { message: `The changed class on ${date} ${gap.field === "start" ? "starts" : "ends"} at ${gap.time}, which doesn’t exist on ${gap.date} in ${tz} (the clocks move forward).` };
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
