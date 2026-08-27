import type {
  ActivityEvent,
  AppNotification,
  BookingRequest,
  Client,
  ISODate,
  Message,
  Practice,
  PracticeState,
  Reflection,
  Resource,
  Session,
  SessionPreparation,
} from '@/types';
import {
  bookableSlotsOn,
  datesWithAvailability,
  findConflicts,
  type BookableSlot,
  type Conflict,
  type ConflictSource,
} from './scheduling';
import type { AppState } from '@/state/store';
import {
  defaultBaselineConfig,
  readBaseline,
  type BaselineReading,
  type BaselineSignals,
  type DaySignal,
} from './baselineEngine';
import { DEMO_NOW, atTime, dayDiff, lastDays, toISODate } from '@/utils/date';

/* -------------------------------------------------------------- practices */

export const practiceAt = (practice: Practice): Date => atTime(practice.date, practice.targetTime);

export function practiceState(practice: Practice, at: Date = DEMO_NOW): PracticeState {
  if (practice.completedAt) return 'completed';
  if (practice.optional) return 'optional';
  const target = practiceAt(practice);
  if (target > at) return 'later';
  return practice.date < toISODate(at) ? 'not-completed' : 'available';
}

const byTime = (a: Practice, b: Practice) => practiceAt(a).getTime() - practiceAt(b).getTime();

export const practicesOf = (state: AppState, clientId: string): Practice[] =>
  state.practices.filter((p) => p.clientId === clientId).sort(byTime);

export const practicesOn = (state: AppState, clientId: string, date: ISODate): Practice[] =>
  practicesOf(state, clientId).filter((p) => p.date === date);

export const todaysPractices = (state: AppState, clientId: string): Practice[] =>
  practicesOn(state, clientId, toISODate(DEMO_NOW));

/** Completed / total for a day, counting the whole day's plan. */
export function dayProgress(state: AppState, clientId: string, date: ISODate) {
  const list = practicesOn(state, clientId, date);
  return { completed: list.filter((p) => p.completedAt).length, total: list.length };
}

/* --------------------------------------------------------------- baseline */

export function buildDaySignals(state: AppState, clientId: string, count = 21): DaySignal[] {
  const all = practicesOf(state, clientId);
  return lastDays(count).map((date) => {
    const onDay = all.filter((p) => p.date === date);
    // A pattern is only read from days that have finished. A practice that was
    // due two hours ago may still happen today, and counting it would overstate
    // the signal.
    const missed = onDay.filter((p) => practiceState(p) === 'not-completed');
    return {
      date,
      assigned: onDay.length,
      completed: onDay.filter((p) => p.completedAt).length,
      missedPartsOfDay: missed.map((p) => p.partOfDay),
    };
  });
}

export function buildSignals(state: AppState, client: Client): BaselineSignals {
  const days = buildDaySignals(state, client.id, client.baselineDays);
  const next = nextSessionFor(state, client.id);
  return {
    usualRhythm: client.usualRhythm,
    baselineDays: client.baselineDays,
    days,
    daysInactive: dayDiff(client.lastActivityAt),
    weeksTogether: client.weeksTogether,
    recentReflections: state.reflections.filter(
      (r) => r.clientId === client.id && dayDiff(r.submittedAt) <= defaultBaselineConfig.window,
    ).length,
    sessionPrep: next
      ? { answered: next.preSession?.length ?? 0, total: 3 }
      : undefined,
    resourceOpens: state.events.filter(
      (e) => e.clientId === client.id && e.kind === 'resource-opened' && dayDiff(e.at) <= 3,
    ).length,
  };
}

/**
 * The practitioner's reading of a client. Private by construction — nothing in
 * `routes/client/**` imports this.
 */
export const readingFor = (state: AppState, clientId: string): BaselineReading => {
  const client = state.clients.find((c) => c.id === clientId)!;
  return readBaseline(buildSignals(state, client));
};

export interface ClientReading {
  client: Client;
  reading: BaselineReading;
  nextSession?: Session;
  lastActivity?: ActivityEvent;
}

export const allReadings = (state: AppState): ClientReading[] =>
  state.clients.map((client) => ({
    client,
    reading: readingFor(state, client.id),
    nextSession: nextSessionFor(state, client.id),
    lastActivity: state.events.find((e) => e.clientId === client.id),
  }));

/**
 * A 21-day series of daily completion rates, for the rhythm visualisation.
 * `recent` marks the days inside the current window.
 */
export function rhythmSeries(state: AppState, clientId: string, days = 21) {
  const signals = buildDaySignals(state, clientId, days);
  const windowStart = days - defaultBaselineConfig.window;
  return signals.map((day, index) => ({
    date: day.date,
    value: day.assigned === 0 ? null : Math.round((day.completed / day.assigned) * 100),
    recent: index >= windowStart,
  }));
}

/* --------------------------------------------------------------- sessions */

const bySoonest = (a: Session, b: Session) =>
  new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();

export const sessionsOf = (state: AppState, clientId: string): Session[] =>
  state.sessions.filter((s) => s.clientId === clientId).sort(bySoonest);

const sessionEnd = (session: Session) => new Date(session.endsAt);

export const isLive = (session: Session) => session.status !== 'cancelled';

/** The next session that has not finished and has not been cancelled. */
export const nextSessionFor = (state: AppState, clientId: string): Session | undefined =>
  sessionsOf(state, clientId).find(
    (s) => s.status === 'scheduled' && sessionEnd(s) > DEMO_NOW,
  );

export const lastSessionFor = (state: AppState, clientId: string): Session | undefined =>
  sessionsOf(state, clientId)
    .filter((s) => isLive(s) && sessionEnd(s) <= DEMO_NOW)
    .pop();

export const sessionsOnDay = (state: AppState, date: ISODate): Session[] =>
  state.sessions.filter((s) => toISODate(s.startsAt) === date).sort(bySoonest);

export const todaysSessions = (state: AppState): Session[] =>
  sessionsOnDay(state, toISODate(DEMO_NOW)).filter(isLive);

export const upcomingSessions = (state: AppState): Session[] =>
  state.sessions.filter((s) => s.status === 'scheduled' && sessionEnd(s) > DEMO_NOW).sort(bySoonest);

export const pastSessions = (state: AppState): Session[] =>
  state.sessions
    .filter((s) => sessionEnd(s) <= DEMO_NOW && isLive(s))
    .sort((a, b) => bySoonest(b, a));

export const hasFinished = (session: Session) => sessionEnd(session) <= DEMO_NOW;

/* -------------------------------------------------------- scheduling reads */

/** Everything a slot or conflict calculation needs, in one place. */
export const conflictSource = (state: AppState): ConflictSource => ({
  sessions: state.sessions,
  series: state.series,
  exceptions: state.exceptions,
  requests: state.bookingRequests,
});

export const conflictsFor = (
  state: AppState,
  startsAt: Date,
  durationMin: number,
  options: { ignoreSessionId?: string; ignoreRequestId?: string; forClientId?: string } = {},
): Conflict[] =>
  findConflicts(
    { start: startsAt, end: new Date(startsAt.getTime() + durationMin * 60_000) },
    conflictSource(state),
    options,
  );

/**
 * The slots a client may book. Returns times only — never the reason a time is
 * missing, and never anything about another client.
 */
export const bookableSlots = (
  state: AppState,
  date: ISODate,
  durationMin: number,
  forClientId?: string,
): BookableSlot[] =>
  bookableSlotsOn(date, state.availability, conflictSource(state), {
    durationMin,
    stepMin: 60,
    minNoticeMin: 120,
    now: DEMO_NOW,
    forClientId,
  });

export const bookableDates = (
  state: AppState,
  days: number,
  durationMin: number,
  forClientId?: string,
): ISODate[] =>
  datesWithAvailability(DEMO_NOW, days, state.availability, conflictSource(state), {
    durationMin,
    stepMin: 60,
    minNoticeMin: 120,
    now: DEMO_NOW,
    forClientId,
  });

export const pendingRequests = (state: AppState): BookingRequest[] =>
  state.bookingRequests
    .filter((r) => r.status === 'pending')
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

export const requestsOf = (state: AppState, clientId: string): BookingRequest[] =>
  state.bookingRequests
    .filter((r) => r.clientId === clientId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

export const exceptionsOn = (state: AppState, date: ISODate) =>
  state.exceptions.filter((e) => e.date === date);

/* ------------------------------------------------------------ preparation */

export const preparationsFor = (state: AppState, sessionId: string): SessionPreparation[] =>
  state.preparations.filter((p) => p.sessionId === sessionId);

export const preparationProgress = (state: AppState, sessionId: string) => {
  const list = preparationsFor(state, sessionId);
  return { completed: list.filter((p) => p.completedAt).length, total: list.length };
};

export const openPreparationsFor = (state: AppState, clientId: string): SessionPreparation[] =>
  state.preparations.filter((p) => p.clientId === clientId && !p.completedAt);

/* --------------------------------------------------------------- messages */

export const messagesOf = (state: AppState, clientId: string): Message[] =>
  state.messages
    .filter((m) => m.clientId === clientId && m.status === 'sent')
    .sort((a, b) => new Date(a.sentAt ?? a.createdAt).getTime() - new Date(b.sentAt ?? b.createdAt).getTime());

export const draftMessage = (state: AppState, clientId: string): Message | undefined =>
  state.messages.find((m) => m.clientId === clientId && m.status === 'draft');

export const unreadForPractitioner = (state: AppState, clientId?: string): number =>
  state.messages.filter(
    (m) =>
      m.status === 'sent' &&
      m.author === 'client' &&
      !m.readByPractitioner &&
      (!clientId || m.clientId === clientId),
  ).length;

export const unreadForClient = (state: AppState, clientId: string): number =>
  state.messages.filter(
    (m) => m.status === 'sent' && m.author === 'practitioner' && !m.readByClient && m.clientId === clientId,
  ).length;

/* ---------------------------------------------------------- notifications */

export const notificationsFor = (
  state: AppState,
  audience: 'practitioner' | 'client',
  clientId?: string,
): AppNotification[] =>
  state.notifications
    .filter((n) => n.audience === audience && (audience === 'practitioner' || n.clientId === clientId))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

export const unreadNotifications = (
  state: AppState,
  audience: 'practitioner' | 'client',
  clientId?: string,
): number => notificationsFor(state, audience, clientId).filter((n) => !n.read).length;

/* ------------------------------------------------------------ reflections */

export const reflectionsOf = (state: AppState, clientId: string): Reflection[] =>
  state.reflections
    .filter((r) => r.clientId === clientId)
    .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

export const latestReflection = (state: AppState, clientId: string): Reflection | undefined =>
  reflectionsOf(state, clientId)[0];

export const unreadReflections = (state: AppState): Reflection[] =>
  state.reflections
    .filter((r) => !r.readByPractitioner)
    .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

/* -------------------------------------------------------------- resources */

/** Only what has actually been shared with this client, never the whole library. */
export const resourcesFor = (state: AppState, clientId: string): Resource[] => {
  const viaPractice = new Set(
    practicesOf(state, clientId)
      .map((p) => p.resourceId)
      .filter(Boolean) as string[],
  );
  const assigned = new Set(
    state.resourceAssignments.filter((a) => a.clientId === clientId).map((a) => a.resourceId),
  );
  return state.resources.filter(
    (r) => r.status === 'active' && (assigned.has(r.id) || viaPractice.has(r.id)),
  );
};

export const assignmentFor = (state: AppState, clientId: string, resourceId: string) =>
  state.resourceAssignments.find((a) => a.clientId === clientId && a.resourceId === resourceId);

export const clientsUsing = (state: AppState, resourceId: string): Client[] => {
  const ids = new Set(
    state.resourceAssignments.filter((a) => a.resourceId === resourceId).map((a) => a.clientId),
  );
  for (const practice of state.practices) {
    if (practice.resourceId === resourceId) ids.add(practice.clientId);
  }
  return state.clients.filter((c) => ids.has(c.id));
};

export const activeResources = (state: AppState): Resource[] =>
  state.resources.filter((r) => r.status === 'active');

/* ---------------------------------------------------------------- events */

export const recentEvents = (state: AppState, limit = 12): ActivityEvent[] =>
  state.events.filter((e) => new Date(e.at) <= DEMO_NOW).slice(0, limit);

export const eventsOf = (state: AppState, clientId: string, limit = 20): ActivityEvent[] =>
  state.events.filter((e) => e.clientId === clientId && new Date(e.at) <= DEMO_NOW).slice(0, limit);

/* --------------------------------------------------------------- journey */

export const chaptersFor = (state: AppState, clientId: string) =>
  state.chapters.filter((c) => c.clientId === clientId).sort((a, b) => a.index - b.index);


