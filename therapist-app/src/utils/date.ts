import type { ISODate, ISODateTime } from '@/types';

/**
 * The demo runs against one fixed moment: Wednesday, 26 August 2026, 11:45.
 *
 * This is the time at which every value in the approved specification is true at
 * once — the header reads "Wednesday, Aug 26", today's sessions are 10:30 / 2:00
 * / 4:30, Emma's *next* session is Friday at 10:30 (today's has just finished),
 * her breathing practice was completed at 08:12, and one of her four practices
 * for the day is done.
 */
export const DEMO_NOW = new Date('2026-08-26T11:45:00');

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function asDate(value: Date | ISODate | ISODateTime): Date {
  if (value instanceof Date) return value;
  return new Date(value.length === 10 ? `${value}T00:00:00` : value);
}

export function toISODate(value: Date | ISODateTime): ISODate {
  const d = asDate(value);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
}

export const todayISO = (): ISODate => toISODate(DEMO_NOW);

export function atTime(date: ISODate, time: string): Date {
  return new Date(`${date}T${time}:00`);
}

export function addDays(value: Date | ISODate, days: number): Date {
  const d = asDate(value);
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

export function dayDiff(from: Date | ISODate | ISODateTime, to: Date | ISODateTime = DEMO_NOW): number {
  const a = asDate(from);
  const b = asDate(to);
  const startA = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const startB = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((startB - startA) / 86_400_000);
}

/** "Wednesday, Aug 26" — the format drawn on the Today header. */
export function briefingDate(value: Date | ISODate = DEMO_NOW): string {
  const d = asDate(value);
  return `${WEEKDAY[d.getDay()]}, ${MONTH[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
}

/** "Friday, August 28, 2026" — the format used above a day of practices. */
export function fullDate(value: Date | ISODate): string {
  const d = asDate(value);
  return `${WEEKDAY[d.getDay()]}, ${MONTH[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** "Friday, 10:30 AM" — the format used for a session. */
export function sessionWhen(value: Date | ISODateTime): string {
  const d = asDate(value);
  const diff = dayDiff(d);
  const day = diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : diff === -1 ? 'Tomorrow' : WEEKDAY[d.getDay()];
  return `${day}, ${clockTime(d)}`;
}

/** "10:30 AM" */
export function clockTime(value: Date | ISODateTime | string): string {
  const d = /^\d{2}:\d{2}$/.test(String(value)) ? new Date(`2026-01-01T${value}:00`) : asDate(value as string);
  const hours = d.getHours();
  const minutes = `${d.getMinutes()}`.padStart(2, '0');
  const display = hours % 12 === 0 ? 12 : hours % 12;
  return `${display}:${minutes} ${hours >= 12 ? 'PM' : 'AM'}`;
}

export const weekdayLong = (value: Date | ISODate) => WEEKDAY[asDate(value).getDay()];
export const weekdayShort = (value: Date | ISODate) => WEEKDAY_SHORT[asDate(value).getDay()];
export const monthShort = (value: Date | ISODate | ISODateTime) => MONTH[asDate(value).getMonth()].slice(0, 3);

/** "Aug 26" */
export const shortDate = (value: Date | ISODate | ISODateTime) =>
  `${monthShort(value)} ${asDate(value).getDate()}`;

/** "Today", "Yesterday", "Monday", then "Aug 12". */
export function relativeDay(value: Date | ISODate | ISODateTime): string {
  const diff = dayDiff(value);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff === -1) return 'Tomorrow';
  if (Math.abs(diff) < 7) return WEEKDAY[asDate(value).getDay()];
  return shortDate(value);
}

/** Calm relative phrasing — "2 days ago", never a countdown or a warning. */
export function timeAgo(value: Date | ISODateTime): string {
  const d = asDate(value);
  const minutes = Math.round((DEMO_NOW.getTime() - d.getTime()) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const days = dayDiff(d);
  if (days === 0) {
    const hours = Math.round(minutes / 60);
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  }
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return shortDate(d);
}

/** The Monday-anchored week containing `date`, as seven ISO dates. */
export function weekOf(value: Date | ISODate = DEMO_NOW): ISODate[] {
  const d = asDate(value);
  const monday = addDays(d, -((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => toISODate(addDays(monday, i)));
}

/** The last `count` days ending today, oldest first. */
export const lastDays = (count: number, end: Date = DEMO_NOW): ISODate[] =>
  Array.from({ length: count }, (_, i) => toISODate(addDays(end, i - (count - 1))));

export function greeting(value: Date = DEMO_NOW): string {
  const hour = value.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
