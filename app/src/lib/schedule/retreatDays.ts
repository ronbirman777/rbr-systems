/**
 * The Time to Flow retreat's day list (TASK 033 P2, owner decisions A1/A5).
 *
 * PURE AND TIMEZONE-INDEPENDENT. Every input is a calendar date
 * ("YYYY-MM-DD") that is already in the Space's IANA timezone: activity
 * dates are stored that way, the optional retreat start/end dates are
 * entered that way, and `todayIso` comes from `todayInTimezone(space tz)`.
 * Nothing here reads the device or server clock or zone; the arithmetic is
 * done on UTC-midnight epoch days, so the result is identical under any
 * `TZ` and across DST changes.
 *
 * DAY NUMBERING (A1). Day n = calendar offset from the anchor start + 1,
 * never the position in the list. A date with no activities is still
 * listed and still counts, so a gap never renumbers the days after it.
 *
 *   anchor start = retreat start date when set, else the earliest
 *                  scheduled activity date (`derived`).
 *
 * RANGE. From the start to the end date inclusive. A missing side falls
 * back to the earliest/latest activity date. When neither is set the whole
 * list is derived from the activities and flagged `derived`, so a UI (or a
 * reviewer) can tell the two apart.
 *
 * ACTIVITIES OUTSIDE THE CONFIGURED RANGE stay reachable: the list is
 * EXTENDED to include them rather than hiding them, because an organizer
 * who moved the dates but not every activity must not silently lose
 * sessions from the guest's schedule. Extended days are flagged
 * `outsideRange`. A day before the start has no meaningful "Day n", so its
 * `dayNumber` is null; a day after the end keeps its calendar number.
 *
 * SAFETY CAP. A navigator of hundreds of chips is unusable, and a stray
 * activity years away would otherwise produce one. When the full span is
 * longer than MAX_NAVIGATOR_SPAN_DAYS, the list keeps only the configured
 * range plus the dates that actually have activities (still numbered by
 * calendar offset). The Studio separately limits the configured range to
 * MAX_RETREAT_RANGE_DAYS.
 */

/** The longest retreat an organizer can configure, start and end inclusive. */
export const MAX_RETREAT_RANGE_DAYS = 60;

/** Beyond this span the list stops filling every calendar day (see above). */
export const MAX_NAVIGATOR_SPAN_DAYS = 120;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export type RetreatDay = {
  date: string;
  /** Calendar offset from the anchor start + 1; null before the start. */
  dayNumber: number | null;
  isToday: boolean;
  hasActivities: boolean;
  /** True for a day added only because an activity falls outside the configured dates. */
  outsideRange: boolean;
};

export type RetreatDayList = {
  days: RetreatDay[];
  /** True when neither a start nor an end date is set (range taken from the activities). */
  derived: boolean;
};

export type BuildRetreatDaysInput = {
  /** Every scheduled activity's date; duplicates and invalid values are ignored. */
  activityDates: readonly string[];
  startDate?: string | null;
  endDate?: string | null;
  /** "Today" in the Space timezone - `todayInTimezone(spaceTimezone)`. */
  todayIso: string;
};

/** "YYYY-MM-DD" -> epoch day number, or null for anything that is not a real calendar date. */
export function isoToEpochDay(dateIso: string | null | undefined): number | null {
  if (typeof dateIso !== "string") return null;
  const m = ISO_DATE.exec(dateIso);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const ms = Date.UTC(y, mo - 1, d);
  const check = new Date(ms);
  // Rejects 2027-02-30 and friends, which Date.UTC silently rolls over.
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return Math.round(ms / MS_PER_DAY);
}

export function epochDayToIso(epochDay: number): string {
  return new Date(epochDay * MS_PER_DAY).toISOString().slice(0, 10);
}

export function isValidIsoDate(value: unknown): value is string {
  return typeof value === "string" && isoToEpochDay(value) !== null;
}

/** Inclusive number of calendar days from start to end (1 for a single day). */
export function inclusiveDaySpan(startIso: string, endIso: string): number | null {
  const a = isoToEpochDay(startIso);
  const b = isoToEpochDay(endIso);
  if (a === null || b === null) return null;
  return b - a + 1;
}

type ResolvedRetreatRange = {
  /** Distinct valid activity epoch days, ascending. */
  activityDays: number[];
  /** Epoch day numbered "Day 1" (null when there is nothing to anchor to). */
  start: number | null;
  end: number | null;
  derived: boolean;
};

/**
 * The single definition of the retreat's anchor (Day 1) and range, shared
 * by buildRetreatDays() and retreatDayOne() so the Day Navigator and every
 * other "Day n" consumer (Daily Inspiration) can never disagree.
 */
function resolveRetreatRange({ activityDates, startDate, endDate }: Omit<BuildRetreatDaysInput, "todayIso">): ResolvedRetreatRange {
  const activityDays = Array.from(
    new Set(activityDates.map((d) => isoToEpochDay(d)).filter((n): n is number => n !== null))
  ).sort((a, b) => a - b);

  let start = isoToEpochDay(startDate ?? null);
  let end = isoToEpochDay(endDate ?? null);
  // A stored end before its start cannot be honoured; treat it as unset
  // rather than producing an empty or reversed list.
  if (start !== null && end !== null && end < start) end = null;
  const derived = start === null && end === null;

  const firstActivity = activityDays[0] ?? null;
  const lastActivity = activityDays[activityDays.length - 1] ?? null;

  if (start === null) start = end !== null && (firstActivity === null || firstActivity > end) ? end : firstActivity;
  if (end === null) end = lastActivity !== null && start !== null && lastActivity >= start ? lastActivity : start;
  return { activityDays, start, end, derived };
}

/**
 * The date the Day Navigator labels "Day 1" ("YYYY-MM-DD"), or null when
 * there are neither dates nor activities. Same rule as buildRetreatDays():
 * the retreat start date when set, else derived from the activities (and
 * the end date when only that is set).
 */
export function retreatDayOne(input: Omit<BuildRetreatDaysInput, "todayIso">): string | null {
  const { start } = resolveRetreatRange(input);
  return start === null ? null : epochDayToIso(start);
}

export function buildRetreatDays({ activityDates, startDate, endDate, todayIso }: BuildRetreatDaysInput): RetreatDayList {
  const { activityDays, start, end, derived } = resolveRetreatRange({ activityDates, startDate, endDate });
  if (start === null || end === null) return { days: [], derived };

  const firstActivity = activityDays[0] ?? null;
  const lastActivity = activityDays[activityDays.length - 1] ?? null;

  const rangeStart = start;
  const rangeEnd = end;
  const from = Math.min(rangeStart, firstActivity ?? rangeStart);
  const to = Math.max(rangeEnd, lastActivity ?? rangeEnd);

  const activitySet = new Set(activityDays);
  const today = isoToEpochDay(todayIso);

  let epochDays: number[];
  if (to - from + 1 <= MAX_NAVIGATOR_SPAN_DAYS) {
    epochDays = [];
    for (let n = from; n <= to; n++) epochDays.push(n);
  } else {
    const kept = new Set(activityDays);
    const rangeLength = Math.min(rangeEnd - rangeStart + 1, MAX_NAVIGATOR_SPAN_DAYS);
    for (let n = rangeStart; n < rangeStart + rangeLength; n++) kept.add(n);
    epochDays = Array.from(kept).sort((a, b) => a - b);
  }

  const days = epochDays.map((n): RetreatDay => {
    const offset = n - rangeStart;
    return {
      date: epochDayToIso(n),
      dayNumber: offset >= 0 ? offset + 1 : null,
      isToday: today !== null && n === today,
      hasActivities: activitySet.has(n),
      outsideRange: n < rangeStart || n > rangeEnd,
    };
  });
  return { days, derived };
}

/**
 * The day selected when the screen opens: today when it is in the list,
 * else the next upcoming day, else (the retreat is over) the first day.
 */
export function defaultRetreatDay(days: readonly RetreatDay[], todayIso: string): string | null {
  if (days.length === 0) return null;
  const today = days.find((d) => d.date === todayIso);
  if (today) return today.date;
  const upcoming = days.find((d) => d.date >= todayIso);
  return (upcoming ?? days[0]).date;
}

export type RetreatDatesError = "invalidDate" | "endBeforeStart" | "rangeTooLong";

/** The `flow` dictionary key that explains each validation error ({max} = MAX_RETREAT_RANGE_DAYS). */
export const RETREAT_DATES_ERROR_KEY = {
  invalidDate: "retreatDatesInvalid",
  endBeforeStart: "retreatDatesEndBeforeStart",
  rangeTooLong: "retreatDatesTooLong",
} as const satisfies Record<RetreatDatesError, string>;

/**
 * Studio validation for the optional start/end pair. Both optional; when
 * both are set the end must not be before the start and the range may
 * span at most MAX_RETREAT_RANGE_DAYS days inclusive.
 */
export function validateRetreatDates(
  startDate: string | null | undefined,
  endDate: string | null | undefined
): RetreatDatesError | null {
  const s = startDate ? isoToEpochDay(startDate) : null;
  const e = endDate ? isoToEpochDay(endDate) : null;
  if ((startDate && s === null) || (endDate && e === null)) return "invalidDate";
  if (s !== null && e !== null) {
    if (e < s) return "endBeforeStart";
    if (e - s + 1 > MAX_RETREAT_RANGE_DAYS) return "rangeTooLong";
  }
  return null;
}
