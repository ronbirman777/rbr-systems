import type {
  AvailabilityException,
  AvailabilityRule,
  BookingRequest,
  ISODate,
  ISODateTime,
  RecurrenceRule,
  Session,
  SessionSeries,
} from '@/types';
import { addDays, atTime, toISODate } from '@/utils/date';

/**
 * Scheduling.
 *
 * One rule governs this whole file: a bookable slot is what remains of the
 * practitioner's availability once every real commitment is removed. Clients
 * receive only that remainder — never the calendar it was computed from, and
 * never anything that would reveal another client.
 *
 *   bookable = availability
 *              − scheduled sessions
 *              − reserved recurring slots
 *              − blocked time
 *              − accepted booking requests
 *              − pending booking requests (held while awaiting a decision)
 */

export interface Interval {
  start: Date;
  end: Date;
}

export const overlaps = (a: Interval, b: Interval): boolean => a.start < b.end && b.start < a.end;

export const sessionInterval = (session: Session): Interval => ({
  start: new Date(session.startsAt),
  end: new Date(session.endsAt),
});

const minutesBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 60_000);

/* ------------------------------------------------------------ availability */

/** The availability windows that apply on a given date. */
export function windowsOn(date: ISODate, rules: AvailabilityRule[]): Interval[] {
  const day = new Date(`${date}T00:00:00`).getDay();
  return rules
    .filter((rule) => {
      if (rule.dayOfWeek !== day) return false;
      if (rule.effectiveFrom > date) return false;
      if (rule.effectiveUntil && rule.effectiveUntil < date) return false;
      return true;
    })
    .map((rule) => ({ start: atTime(date, rule.startTime), end: atTime(date, rule.endTime) }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Blocked intervals on a date, including whole-day blocks. */
export function blockedOn(date: ISODate, exceptions: AvailabilityException[]): Interval[] {
  return exceptions
    .filter((exception) => exception.date === date)
    .map((exception) =>
      exception.allDay
        ? { start: atTime(date, '00:00'), end: atTime(date, '23:59') }
        : {
            start: atTime(date, exception.startTime ?? '00:00'),
            end: atTime(date, exception.endTime ?? '23:59'),
          },
    );
}

/* -------------------------------------------------------------- recurrence */

const matchesRule = (rule: RecurrenceRule, startsOn: ISODate, date: ISODate): boolean => {
  const from = new Date(`${startsOn}T00:00:00`);
  const on = new Date(`${date}T00:00:00`);
  if (on < from) return false;
  const weeks = Math.floor((on.getTime() - from.getTime()) / (7 * 86_400_000));
  switch (rule) {
    case 'weekly':
      return true;
    case 'biweekly':
      return weeks % 2 === 0;
    case 'monthly':
      return on.getDate() === from.getDate();
    default:
      return false;
  }
};

/** Whether a series holds its slot on a given date. */
export function seriesOccursOn(series: SessionSeries, date: ISODate): boolean {
  const day = new Date(`${date}T00:00:00`).getDay();
  if (series.dayOfWeek !== day) return false;
  if (series.endsOn && date > series.endsOn) return false;
  return matchesRule(series.rule, series.startsOn, date);
}

/** Time a reserving series holds on a date, whether or not a session exists yet. */
export function reservedOn(date: ISODate, series: SessionSeries[]): Interval[] {
  return series
    .filter((item) => item.reservesSlot && seriesOccursOn(item, date))
    .map((item) => ({
      start: atTime(date, item.startTime),
      end: new Date(atTime(date, item.startTime).getTime() + item.durationMin * 60_000),
    }));
}

/** Concrete dates a series falls on, forward from `from` for `days`. */
export function seriesDates(series: SessionSeries, from: Date, days: number): ISODate[] {
  const out: ISODate[] = [];
  for (let i = 0; i < days; i += 1) {
    const date = toISODate(addDays(from, i));
    if (seriesOccursOn(series, date)) out.push(date);
  }
  return out;
}

/* --------------------------------------------------------------- conflicts */

export interface ConflictSource {
  sessions: Session[];
  series: SessionSeries[];
  exceptions: AvailabilityException[];
  requests: BookingRequest[];
}

export type ConflictKind = 'session' | 'reserved' | 'blocked' | 'request' | 'outside-availability';

export interface Conflict {
  kind: ConflictKind;
  /** Plain sentence for the practitioner. Never names another client to a client. */
  label: string;
  clientId?: string;
}

const requestInterval = (request: BookingRequest): Interval => ({
  start: new Date(request.startsAt),
  end: new Date(new Date(request.startsAt).getTime() + request.durationMin * 60_000),
});

/**
 * Everything that clashes with a proposed interval. Returns them all rather
 * than the first, so the interface can explain the whole picture at once.
 */
export function findConflicts(
  candidate: Interval,
  source: ConflictSource,
  options: { ignoreSessionId?: string; ignoreRequestId?: string; forClientId?: string } = {},
): Conflict[] {
  const conflicts: Conflict[] = [];
  const date = toISODate(candidate.start);

  for (const session of source.sessions) {
    if (session.id === options.ignoreSessionId) continue;
    if (session.status === 'cancelled') continue;
    if (!overlaps(candidate, sessionInterval(session))) continue;
    conflicts.push({
      kind: 'session',
      label: 'Another appointment is already booked at this time.',
      clientId: session.clientId,
    });
  }

  for (const series of source.series) {
    if (!series.reservesSlot || !seriesOccursOn(series, date)) continue;
    if (options.forClientId && series.clientId === options.forClientId) continue;
    const start = atTime(date, series.startTime);
    const interval = { start, end: new Date(start.getTime() + series.durationMin * 60_000) };
    if (!overlaps(candidate, interval)) continue;
    // A reserved slot already backed by an expanded session is reported once.
    if (conflicts.some((c) => c.kind === 'session' && c.clientId === series.clientId)) continue;
    conflicts.push({
      kind: 'reserved',
      label: 'This time is reserved as a standing appointment.',
      clientId: series.clientId,
    });
  }

  for (const interval of blockedOn(date, source.exceptions)) {
    if (overlaps(candidate, interval)) {
      conflicts.push({ kind: 'blocked', label: 'This time is blocked out.' });
    }
  }

  for (const request of source.requests) {
    if (request.id === options.ignoreRequestId) continue;
    if (request.status !== 'pending' && request.status !== 'accepted') continue;
    if (request.sessionId) continue; // already represented by its session
    if (!overlaps(candidate, requestInterval(request))) continue;
    conflicts.push({
      kind: 'request',
      label:
        request.status === 'pending'
          ? 'A booking request is waiting on this time.'
          : 'An accepted booking already holds this time.',
      clientId: request.clientId,
    });
  }

  return conflicts;
}

/* ---------------------------------------------------------- bookable slots */

export interface BookableSlot {
  startsAt: ISODateTime;
  endsAt: ISODateTime;
  durationMin: number;
}

export interface SlotOptions {
  durationMin: number;
  /** Step between candidate start times. Defaults to the duration. */
  stepMin?: number;
  /** Nothing may be booked closer to now than this. */
  minNoticeMin?: number;
  now: Date;
  /** When set, this client's own reserved slots do not block them. */
  forClientId?: string;
}

/**
 * The slots a client may book on a date.
 *
 * The return value carries times only — no reason, no other client, nothing
 * about why a time is missing. That asymmetry is the privacy boundary.
 */
export function bookableSlotsOn(
  date: ISODate,
  rules: AvailabilityRule[],
  source: ConflictSource,
  options: SlotOptions,
): BookableSlot[] {
  const { durationMin, now, forClientId } = options;
  const step = options.stepMin ?? durationMin;
  const minNotice = options.minNoticeMin ?? 0;
  const earliest = new Date(now.getTime() + minNotice * 60_000);

  const slots: BookableSlot[] = [];

  for (const window of windowsOn(date, rules)) {
    for (
      let start = new Date(window.start);
      minutesBetween(start, window.end) >= durationMin;
      start = new Date(start.getTime() + step * 60_000)
    ) {
      const candidate = { start, end: new Date(start.getTime() + durationMin * 60_000) };
      if (candidate.start < earliest) continue;
      if (findConflicts(candidate, source, { forClientId }).length > 0) continue;
      slots.push({
        startsAt: candidate.start.toISOString(),
        endsAt: candidate.end.toISOString(),
        durationMin,
      });
    }
  }

  return slots;
}

/** The next `days` dates from `from` that have at least one bookable slot. */
export function datesWithAvailability(
  from: Date,
  days: number,
  rules: AvailabilityRule[],
  source: ConflictSource,
  options: SlotOptions,
): ISODate[] {
  const out: ISODate[] = [];
  for (let i = 0; i < days; i += 1) {
    const date = toISODate(addDays(from, i));
    if (bookableSlotsOn(date, rules, source, options).length > 0) out.push(date);
  }
  return out;
}
