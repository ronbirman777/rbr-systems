import type { AvailabilityMetadata, ClassMetadata, TeachItem } from "./schemas";

import { DEFAULT_LOCALE, translate, type Locale } from "@/lib/i18n";
import { longWeekdayName } from "@/lib/i18n/datetime";
/**
 * Pure date logic for the Teach schedule. Dates are calendar dates
 * ("YYYY-MM-DD") and times are wall-clock "HH:MM" in the Space's time zone;
 * "today"/"now" always come from todayInTimezone/currentTimeInTimezone
 * (src/lib/timezone.ts) - never the guest device clock.
 */

export type TeachClass = TeachItem<"teachClasses">;
export type TeachAvailability = TeachItem<"teachAvailability">;

export function addDays(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekdayOf(dateIso: string): number {
  return new Date(`${dateIso}T12:00:00Z`).getUTCDay();
}

/** Weekday names for pickers and day strips, index 0 = Sunday. */
export function weekdayLabels(locale: Locale = DEFAULT_LOCALE): string[] {
  return [0, 1, 2, 3, 4, 5, 6].map((i) => longWeekdayName(i, locale));
}

function classEndDate(meta: ClassMetadata): string {
  return meta.endDate && meta.endDate >= meta.startDate ? meta.endDate : meta.startDate;
}

/** Calendar date of a UTC instant in an IANA zone (instant -> local; Intl is exact in this direction). */
export function dateInTimeZone(instantIso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(instantIso));
}

/**
 * Local-date span of a class as seen from `viewTimeZone` (the Space's zone).
 * Same zone (or pre-model rows without instants): the class's own local
 * dates. Different zone: the Space-zone dates of its canonical instants.
 */
function occurrenceSpan(meta: ClassMetadata, viewTimeZone?: string | null): [string, string] {
  if (viewTimeZone && meta.startsAt && meta.timezone && meta.timezone !== viewTimeZone) {
    const start = dateInTimeZone(meta.startsAt, viewTimeZone);
    const end = meta.endsAt ? dateInTimeZone(meta.endsAt, viewTimeZone) : start;
    return [start, end < start ? start : end];
  }
  return [meta.startDate, classEndDate(meta)];
}

export function classOccursOn(meta: ClassMetadata, dateIso: string, viewTimeZone?: string | null): boolean {
  const [start, end] = occurrenceSpan(meta, viewTimeZone);
  return dateIso >= start && dateIso <= end;
}

/**
 * A class has ended once its end (or start, with no end time) is before now.
 * Uses the canonical instant when present and a current instant is given;
 * pre-model rows fall back to wall-clock comparison in the Space's zone.
 */
export function isClassPast(meta: ClassMetadata, todayIso: string, nowTime: string, nowInstant?: string | null): boolean {
  const endInstant = meta.endsAt ?? meta.startsAt;
  if (endInstant && nowInstant) return Date.parse(endInstant) <= Date.parse(nowInstant);
  const end = classEndDate(meta);
  if (end < todayIso) return true;
  if (end > todayIso) return false;
  return (meta.endTime ?? meta.startTime) <= nowTime;
}

function compareClasses(a: ClassMetadata, b: ClassMetadata): number {
  if (a.startsAt && b.startsAt) return Date.parse(a.startsAt) - Date.parse(b.startsAt);
  return a.startDate === b.startDate ? a.startTime.localeCompare(b.startTime) : a.startDate.localeCompare(b.startDate);
}

export function sortClasses<T extends TeachClass>(classes: T[]): T[] {
  return [...classes].sort((a, b) => compareClasses(a.metadata, b.metadata));
}

/** Classes happening on a date (in the Space's zone), in start order (multi-day included). */
export function classesOn<T extends TeachClass>(classes: T[], dateIso: string, viewTimeZone?: string | null): T[] {
  return sortClasses(classes.filter((c) => classOccursOn(c.metadata, dateIso, viewTimeZone)));
}

/** Next class that starts strictly after today (for the empty-today state). */
export function nextUpcomingClass<T extends TeachClass>(classes: T[], todayIso: string, viewTimeZone?: string | null): T | null {
  return sortClasses(classes).find((c) => occurrenceSpan(c.metadata, viewTimeZone)[0] > todayIso) ?? null;
}

export function availabilityOccursOn(meta: AvailabilityMetadata, dateIso: string): boolean {
  if (!meta.enabled) return false;
  if (meta.repeat === "once") return meta.date === dateIso;
  return meta.weekday !== null && weekdayOf(dateIso) === meta.weekday;
}

export function availabilityOn<T extends TeachAvailability>(windows: T[], dateIso: string): T[] {
  return windows
    .filter((w) => availabilityOccursOn(w.metadata, dateIso))
    .sort((a, b) => a.metadata.from.localeCompare(b.metadata.from));
}

export type ScheduleDay = { date: string; classCount: number; availabilityCount: number };

/**
 * The guest day strip: today plus the next `days - 1` days, plus any later
 * dated classes are reachable via "later" grouping in the list itself.
 */
export function buildScheduleDays(
  classes: TeachClass[],
  windows: TeachAvailability[],
  todayIso: string,
  days = 14,
  viewTimeZone?: string | null
): ScheduleDay[] {
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(todayIso, i);
    return {
      date,
      classCount: classes.filter((c) => classOccursOn(c.metadata, date, viewTimeZone)).length,
      availabilityCount: windows.filter((w) => availabilityOccursOn(w.metadata, date)).length,
    };
  });
}

/** Human description of a window, e.g. "Every Tuesday · 10:00 – 13:00". */
/**
 * "Every Tuesday · 09:00 – 11:00".
 *
 * `withWhen: false` drops the recurring part for callers that already
 * show the day; it replaces a `.replace("Every ", "")` at the call site,
 * which only worked in English.
 */
export function describeAvailability(
  meta: AvailabilityMetadata,
  { locale = DEFAULT_LOCALE, withWhen = true }: { locale?: Locale; withWhen?: boolean } = {}
): string {
  const hours = `${meta.from} – ${meta.to}`;
  if (!withWhen) return hours;
  const when =
    meta.repeat === "weekly"
      ? meta.weekday !== null
        ? translate(locale, "teach", "availEveryWeekday", { weekday: longWeekdayName(meta.weekday, locale) })
        : translate(locale, "teach", "availWeekly")
      : meta.date ?? translate(locale, "teach", "availOneOff");
  return `${when} · ${hours}`;
}

export function durationMinutes(meta: ClassMetadata): number | null {
  if (!meta.endTime) return null;
  const [sh, sm] = meta.startTime.split(":").map(Number);
  const [eh, em] = meta.endTime.split(":").map(Number);
  const mins = eh * 60 + em - (sh * 60 + sm);
  return classEndDate(meta) === meta.startDate && mins > 0 ? mins : null;
}

/**
 * Moved to lib/modules/duration.ts, which Flow's audio can import without
 * depending on Teach. Re-exported unchanged for this file's callers.
 */
export { formatDuration } from "@/lib/modules/duration";

/** "Teaching since 2014 · 11 years" and its localized equivalents. */
export function teachingSinceLabel(since: number | null, todayIso: string, locale: Locale = DEFAULT_LOCALE): string | null {
  if (!since) return null;
  const years = Number(todayIso.slice(0, 4)) - since;
  if (years <= 0) return translate(locale, "teach", "teachingSince", { year: since });
  // 1 and 2 are separate keys for Hebrew's dual form ("שנתיים").
  const key = years === 1 ? "yearOne" : years === 2 ? "yearTwo" : "yearsN";
  return translate(locale, "teach", "teachingSinceYears", {
    year: since,
    years: translate(locale, "teach", key, { count: years }),
  });
}
