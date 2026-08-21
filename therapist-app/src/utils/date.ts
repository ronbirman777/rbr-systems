import type { ISODate, ISODateTime } from '@/types';

/**
 * The demo runs against a fixed moment so the narrative always lines up:
 * Friday, 21 August 2026, 08:15 — before John's 10:30 session with Emma.
 */
export const DEMO_NOW = new Date('2026-08-21T08:15:00');

export function now(): Date {
  return new Date(DEMO_NOW);
}

export function todayISO(): ISODate {
  return toISODate(DEMO_NOW);
}

export function toISODate(value: Date | ISODateTime): ISODate {
  const d = typeof value === 'string' ? new Date(value) : value;
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** `YYYY-MM-DD` + `HH:MM` in local time, as a real Date. */
export function atTime(date: ISODate, time: string): Date {
  return new Date(`${date}T${time}:00`);
}

export function addDays(date: Date | ISODate, days: number): Date {
  const d = typeof date === 'string' ? new Date(`${date}T00:00:00`) : new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function daysBetween(from: Date | ISODateTime, to: Date | ISODateTime = DEMO_NOW): number {
  const a = typeof from === 'string' ? new Date(from) : from;
  const b = typeof to === 'string' ? new Date(to) : to;
  const startA = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const startB = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((startB - startA) / 86_400_000);
}

const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function weekdayLong(date: Date | ISODate): string {
  return WEEKDAY_LONG[asDate(date).getDay()];
}

export function weekdayShort(date: Date | ISODate): string {
  return WEEKDAY_SHORT[asDate(date).getDay()];
}

export function asDate(value: Date | ISODate | ISODateTime): Date {
  if (value instanceof Date) return value;
  return new Date(value.length === 10 ? `${value}T00:00:00` : value);
}

/** "Friday, August 21" */
export function longDate(date: Date | ISODate = DEMO_NOW): string {
  const d = asDate(date);
  return `${WEEKDAY_LONG[d.getDay()]}, ${MONTH_LONG[d.getMonth()]} ${d.getDate()}`;
}

/** "21 Aug" style compact label. */
export function shortDate(date: Date | ISODate | ISODateTime): string {
  const d = asDate(date);
  return `${MONTH_LONG[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
}

/** "9:02 AM" */
export function clockTime(value: Date | ISODateTime | string): string {
  const d =
    typeof value === 'string' && /^\d{2}:\d{2}$/.test(value)
      ? new Date(`2026-01-01T${value}:00`)
      : asDate(value);
  const hours = d.getHours();
  const minutes = `${d.getMinutes()}`.padStart(2, '0');
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const display = hours % 12 === 0 ? 12 : hours % 12;
  return `${display}:${minutes} ${suffix}`;
}

/** "Today", "Yesterday", "Tuesday", or "Aug 12" for anything older. */
export function relativeDay(value: Date | ISODate | ISODateTime): string {
  const diff = daysBetween(asDate(value));
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff === -1) return 'Tomorrow';
  if (diff > 1 && diff < 7) return WEEKDAY_LONG[asDate(value).getDay()];
  if (diff < -1 && diff > -7) return WEEKDAY_LONG[asDate(value).getDay()];
  return shortDate(value);
}

/** "2 hours ago", "Yesterday", "4 days ago" — calm, never alarming. */
export function timeAgo(value: Date | ISODateTime): string {
  const d = asDate(value);
  const minutes = Math.round((DEMO_NOW.getTime() - d.getTime()) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24 && daysBetween(d) === 0) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  const days = daysBetween(d);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return shortDate(d);
}

/** Session heading such as "Today · 10:30 AM" or "Tuesday · 10:30 AM". */
export function whenLabel(value: Date | ISODateTime): string {
  return `${relativeDay(value)} · ${clockTime(value)}`;
}

/** The Monday-anchored week containing `date`, as seven ISO dates. */
export function weekOf(date: Date | ISODate = DEMO_NOW): ISODate[] {
  const d = asDate(date);
  const offset = (d.getDay() + 6) % 7; // Monday = 0
  const monday = addDays(d, -offset);
  return Array.from({ length: 7 }, (_, i) => toISODate(addDays(monday, i)));
}

/** Last `count` days ending today, oldest first. */
export function lastDays(count: number, end: Date = DEMO_NOW): ISODate[] {
  return Array.from({ length: count }, (_, i) => toISODate(addDays(end, i - (count - 1))));
}

export function greeting(date: Date = DEMO_NOW): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
