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
