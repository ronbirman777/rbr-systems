import { LOCALE_TAG, type Locale } from "./locales";

/**
 * Locale-aware presentation of dates and times.
 *
 * PRESENTATION ONLY. Nothing here touches the stored instant, the
 * Space's timezone, recurrence expansion or DST handling - those stay
 * exactly where they are (lib/timezone.ts, lib/teach/recurrence.ts,
 * lib/teach/classTime.ts). A Space that switches to Hebrew shows the
 * same class at the same moment, written differently.
 *
 * WHY THE TABLES, AND WHY THEY ARE STILL HERE
 * Teach deliberately avoided Intl for display because ICU output differs
 * between Node and browsers ("Tue 14 Oct" vs "Tue, 14 Oct"), which breaks
 * hydration - see lib/teach/links.ts formatShortDate. That reasoning is
 * still correct, so English keeps its hand-rolled table and its exact
 * current output, byte for byte.
 *
 * Hebrew and German cannot reasonably be hand-tabled for every format, so
 * they use Intl with an explicit timeZone and an explicit locale tag -
 * never the host default. Both server and client are therefore given the
 * same two inputs and produce the same string. The one remaining variable
 * is the host's ICU version, which is why these are used for Guest
 * display text and never for date arithmetic.
 */

const SHORT_WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHORT_MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_WEEKDAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function parseIsoDate(dateIso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso);
  if (!m) return null;
  // Midday UTC: far enough from either boundary that no timezone shifts
  // the calendar date during formatting.
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * "2026-10-14" -> "Tue 14 Oct" (en), "יום ג׳, 14 באוק׳" (he),
 * "Di., 14. Okt." (de).
 *
 * English output is unchanged from formatShortDate, so an English Space
 * renders byte-identically to today.
 */
export function formatShortDateLocalized(dateIso: string, locale: Locale): string {
  const d = parseIsoDate(dateIso);
  if (!d) return dateIso;

  if (locale === "en") {
    return `${SHORT_WEEKDAYS_EN[d.getUTCDay()]} ${d.getUTCDate()} ${SHORT_MONTHS_EN[d.getUTCMonth()]}`;
  }

  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(d);
}

/** "2026-10-14" -> "Tuesday 14 October" and its localized equivalents. */
export function formatLongDateLocalized(dateIso: string, locale: Locale): string {
  const d = parseIsoDate(dateIso);
  if (!d) return dateIso;

  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(d);
}

/**
 * A stored "HH:MM" wall-clock time, presented for the locale.
 *
 * The stored value is never reinterpreted: "09:00" in the Space's own
 * timezone stays nine in the morning in that timezone. Only the written
 * form changes (English and German keep 24-hour, which is what both
 * already use).
 */
export function formatTimeLocalized(hhmm: string, locale: Locale): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return hhmm;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return hhmm;

  if (locale === "en" || locale === "de") {
    return `${String(hours).padStart(2, "0")}:${m[2]}`;
  }

  const d = new Date(Date.UTC(2000, 0, 1, hours, minutes));
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  }).format(d);
}

/** Locale-aware digits for counts and durations. */
export function formatNumberLocalized(value: number, locale: Locale): string {
  return new Intl.NumberFormat(LOCALE_TAG[locale]).format(value);
}

// ---------------------------------------------------------------------------
// Calendar names and parts, for text that is assembled rather than formatted
// (recurrence summaries, weekday pickers, day strips).
// ---------------------------------------------------------------------------

/** A reference week in UTC. 2024-01-07 is a Sunday, so index 0 = Sunday. */
function referenceDay(weekdayIndex: number): Date {
  return new Date(Date.UTC(2024, 0, 7 + weekdayIndex, 12));
}

/**
 * "Sun" / "א׳" / "So" - index 0 = Sunday, matching weekdayOfDate().
 *
 * ICU's Hebrew short weekday is "יום א׳" - it carries the word "day"
 * inside it. Left alone, a carrier phrase like "on days {days}" produces
 * "בימים יום א׳, יום ד׳", which says "day" twice. Israelis write
 * "בימים א׳, ד׳", so the prefix is dropped here, once, rather than at
 * each call site.
 */
export function shortWeekdayName(weekdayIndex: number, locale: Locale): string {
  if (locale === "en") return SHORT_WEEKDAYS_EN[weekdayIndex];
  const name = new Intl.DateTimeFormat(LOCALE_TAG[locale], { weekday: "short", timeZone: "UTC" }).format(
    referenceDay(weekdayIndex)
  );
  return locale === "he" ? name.replace(/^יום\s+/, "") : name;
}

/** "Sunday" / "ראשון" / "Sonntag" - index 0 = Sunday. */
export function longWeekdayName(weekdayIndex: number, locale: Locale): string {
  if (locale === "en") return LONG_WEEKDAYS_EN[weekdayIndex];
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], { weekday: "long", timeZone: "UTC" }).format(
    referenceDay(weekdayIndex)
  );
}

/**
 * "31 Dec 2027" and its localized equivalents, for a recurrence end date.
 * English keeps the exact output of recurrenceText's formatLongDate.
 */
export function formatDayMonthYearLocalized(dateIso: string, locale: Locale): string {
  const d = parseIsoDate(dateIso);
  if (!d) return dateIso;
  if (locale === "en") {
    return `${d.getUTCDate()} ${SHORT_MONTHS_EN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

/**
 * The day-of-month as it is written in an ordinal position: "5th", "5."
 * (German), and a bare "5" in Hebrew, which has no written ordinal for
 * dates - the carrier phrase supplies the sense instead.
 */
export function ordinalDayLocalized(day: number, locale: Locale): string {
  if (locale === "de") return `${day}.`;
  if (locale === "he") return String(day);
  const mod100 = day % 100;
  const suffix =
    mod100 >= 11 && mod100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[day % 10] ?? "th";
  return `${day}${suffix}`;
}

/**
 * Uppercases the first letter for a string used at the start of a line.
 *
 * Assembled phrases are stored lowercase ("every week"), because most of
 * their uses are mid-sentence ("Repeats every week"). Hebrew has no case,
 * so this is a no-op there, which is why it is safe to apply blindly.
 */
export function capitalizeFirst(text: string): string {
  return text.length === 0 ? text : text[0].toLocaleUpperCase() + text.slice(1);
}

/**
 * A retreat's dates: "14-20 Oct 2027", "28 Oct - 3 Nov 2027",
 * "30 Dec 2027 - 2 Jan 2028", or a single day when there is no distinct end.
 *
 * English is hand-assembled for the same hydration reason as every other
 * English format in this file; other locales use Intl's own range
 * formatting with an explicit locale tag and UTC, so the calendar day can
 * never move with the viewer's zone. Both ends are plain "YYYY-MM-DD".
 */
export function formatDateRangeLocalized(startIso: string, endIso: string | null, locale: Locale): string {
  const a = parseIsoDate(startIso);
  if (!a) return startIso;
  const b = endIso && endIso !== startIso ? parseIsoDate(endIso) : null;
  if (!b || b.getTime() < a.getTime()) return formatDayMonthYearLocalized(startIso, locale);

  if (locale === "en") {
    const dash = "\u2013";
    const ay = a.getUTCFullYear();
    const by = b.getUTCFullYear();
    const am = a.getUTCMonth();
    const bm = b.getUTCMonth();
    if (ay === by && am === bm) {
      return `${a.getUTCDate()}${dash}${b.getUTCDate()} ${SHORT_MONTHS_EN[bm]} ${by}`;
    }
    if (ay === by) {
      return `${a.getUTCDate()} ${SHORT_MONTHS_EN[am]} ${dash} ${b.getUTCDate()} ${SHORT_MONTHS_EN[bm]} ${by}`;
    }
    return `${formatDayMonthYearLocalized(startIso, locale)} ${dash} ${formatDayMonthYearLocalized(endIso as string, locale)}`;
  }

  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).formatRange(a, b);
}
