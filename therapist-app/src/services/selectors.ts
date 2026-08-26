import type {
  ActivityEvent,
  Client,
  ISODate,
  Practice,
  PracticeState,
  Reflection,
  Resource,
  Session,
} from '@/types';
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

const sessionEnd = (session: Session) =>
  new Date(new Date(session.startsAt).getTime() + session.durationMin * 60_000);

/** The next session that has not finished yet. */
export const nextSessionFor = (state: AppState, clientId: string): Session | undefined =>
  sessionsOf(state, clientId).find((s) => s.status === 'upcoming' && sessionEnd(s) > DEMO_NOW);

export const lastSessionFor = (state: AppState, clientId: string): Session | undefined =>
  sessionsOf(state, clientId)
    .filter((s) => sessionEnd(s) <= DEMO_NOW)
    .pop();

export const sessionsOnDay = (state: AppState, date: ISODate): Session[] =>
  state.sessions.filter((s) => toISODate(s.startsAt) === date).sort(bySoonest);

export const todaysSessions = (state: AppState): Session[] => sessionsOnDay(state, toISODate(DEMO_NOW));

export const upcomingSessions = (state: AppState): Session[] =>
  state.sessions.filter((s) => sessionEnd(s) > DEMO_NOW).sort(bySoonest);

export const pastSessions = (state: AppState): Session[] =>
  state.sessions.filter((s) => sessionEnd(s) <= DEMO_NOW).sort((a, b) => bySoonest(b, a));

export const hasFinished = (session: Session) => sessionEnd(session) <= DEMO_NOW;

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

export const resourcesFor = (state: AppState, clientId: string): Resource[] => {
  const viaPractice = new Set(
    practicesOf(state, clientId)
      .map((p) => p.resourceId)
      .filter(Boolean) as string[],
  );
  return state.resources.filter((r) => r.assignedTo.includes(clientId) || viaPractice.has(r.id));
};

/* ---------------------------------------------------------------- events */

export const recentEvents = (state: AppState, limit = 12): ActivityEvent[] =>
  state.events.filter((e) => new Date(e.at) <= DEMO_NOW).slice(0, limit);

export const eventsOf = (state: AppState, clientId: string, limit = 20): ActivityEvent[] =>
  state.events.filter((e) => e.clientId === clientId && new Date(e.at) <= DEMO_NOW).slice(0, limit);

/* --------------------------------------------------------------- journey */

export const chaptersFor = (state: AppState, clientId: string) =>
  state.chapters.filter((c) => c.clientId === clientId).sort((a, b) => a.index - b.index);

/* -------------------------------------------------------------- check-ins */

export const checkInsOf = (state: AppState, clientId: string) =>
  state.checkIns
    .filter((c) => c.clientId === clientId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

export const draftCheckIn = (state: AppState, clientId: string) =>
  state.checkIns.find((c) => c.clientId === clientId && c.status === 'draft');
