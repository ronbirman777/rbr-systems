import type { AvailabilityException, AvailabilityRule, BookingRequest, SessionSeries } from '@/types';

/** The practice runs on one timezone for now; the field is here so it can not. */
export const PRACTICE_TIMEZONE = 'Europe/Lisbon';

const rule = (
  id: string,
  dayOfWeek: number,
  startTime: string,
  endTime: string,
): AvailabilityRule => ({
  id,
  practitionerId: 'john',
  dayOfWeek,
  startTime,
  endTime,
  timezone: PRACTICE_TIMEZONE,
  effectiveFrom: '2026-01-01',
});

/**
 * When John allows clients to book. Availability is not an appointment: it is
 * the outer boundary from which bookable slots are generated once real
 * appointments, reserved slots and blocked time are removed.
 */
export const availabilityRules: AvailabilityRule[] = [
  // Monday runs in two windows, with the middle of the day kept back.
  rule('av-mon-1', 1, '09:00', '13:00'),
  rule('av-mon-2', 1, '15:00', '18:00'),
  // Tuesday is one long window; lunch is removed by a block, not by the rule.
  rule('av-tue-1', 2, '09:00', '17:00'),
  rule('av-wed-1', 3, '09:00', '14:00'),
  rule('av-thu-1', 4, '10:00', '17:00'),
  rule('av-fri-1', 5, '09:00', '13:00'),
];

/** Date-specific time John is not available. Never bookable, never shown to clients. */
export const availabilityExceptions: AvailabilityException[] = [
  {
    id: 'ex-lunch-0901',
    practitionerId: 'john',
    date: '2026-09-01',
    allDay: false,
    startTime: '13:00',
    endTime: '14:00',
    reason: 'lunch',
  },
  {
    id: 'ex-supervision-0903',
    practitionerId: 'john',
    date: '2026-09-03',
    allDay: false,
    startTime: '12:00',
    endTime: '14:00',
    reason: 'private-appointment',
    note: 'Supervision',
  },
  {
    id: 'ex-conference-0910',
    practitionerId: 'john',
    date: '2026-09-10',
    allDay: true,
    reason: 'conference',
    note: 'Somatic practice conference',
  },
];

/**
 * Standing appointments. Concrete sessions are expanded from these, and a
 * series that reserves its slot keeps the time held even before expansion.
 */
export const sessionSeries: SessionSeries[] = [
  {
    id: 'sr-grace-weekly',
    clientId: 'grace',
    rule: 'weekly',
    dayOfWeek: 1,
    startTime: '09:00',
    durationMin: 50,
    mode: 'video',
    focus: 'OCD',
    startsOn: '2026-01-19',
    reservesSlot: true,
    createdAt: '2026-01-14T09:00:00',
  },
  {
    id: 'sr-liam-biweekly',
    clientId: 'liam',
    rule: 'biweekly',
    dayOfWeek: 4,
    startTime: '15:30',
    durationMin: 60,
    mode: 'in-person',
    focus: 'Trauma',
    startsOn: '2026-03-05',
    reservesSlot: true,
    createdAt: '2026-03-04T14:00:00',
  },
];

/** Requests waiting on John, and the history behind them. */
export const bookingRequests: BookingRequest[] = [
  {
    id: 'br-noah-0902',
    clientId: 'noah',
    startsAt: '2026-09-02T11:00:00',
    durationMin: 50,
    mode: 'video',
    status: 'pending',
    note: 'Earlier in the day works better for me this week if that is possible.',
    createdAt: '2026-08-26T08:20:00',
  },
  {
    id: 'br-lucas-0831',
    clientId: 'lucas',
    startsAt: '2026-08-31T17:00:00',
    durationMin: 50,
    mode: 'video',
    status: 'accepted',
    createdAt: '2026-08-24T20:10:00',
    respondedAt: '2026-08-25T08:05:00',
    sessionId: 'se-lucas-0901',
  },
];
