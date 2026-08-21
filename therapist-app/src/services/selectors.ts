import type {
  ActivityEvent,
  Client,
  ISODate,
  Practice,
  PracticeState,
  Session,
  Thread,
} from '@/types';
import type { EcosystemState } from '@/state/ecosystemReducer';
import {
  defaultEngagementConfig,
  evaluateEngagement,
  type DaySignal,
  type EngagementReading,
  type EngagementSignals,
} from './engagementEngine';
import { DEMO_NOW, atTime, daysBetween, lastDays, toISODate } from '@/utils/date';

/* ------------------------------------------------------------- practices */

export function practiceScheduledAt(practice: Practice): Date {
  return atTime(practice.date, practice.time);
}

export function practiceState(practice: Practice, at: Date = DEMO_NOW): PracticeState {
  if (practice.completion) return 'completed';
  const scheduled = practiceScheduledAt(practice);
  if (scheduled > at) return 'upcoming';
  return practice.date < toISODate(at) ? 'missed' : 'due';
}

export const practicesFor = (state: EcosystemState, clientId: string): Practice[] =>
  state.practices
    .filter((p) => p.clientId === clientId)
    .sort((a, b) => practiceScheduledAt(a).getTime() - practiceScheduledAt(b).getTime());

export const practicesOn = (state: EcosystemState, clientId: string, date: ISODate): Practice[] =>
  practicesFor(state, clientId).filter((p) => p.date === date);

/** Practices already due today, plus anything still ahead of the clock. */
export function todaysPractices(state: EcosystemState, clientId: string): Practice[] {
  return practicesOn(state, clientId, toISODate(DEMO_NOW));
}

/* ------------------------------------------------------------- engagement */

export function buildDaySignals(
  state: EcosystemState,
  clientId: string,
  dayCount = 7,
): DaySignal[] {
  const days = lastDays(dayCount);
  const all = practicesFor(state, clientId);

  return days.map((date) => {
    const onDay = all.filter((p) => p.date === date);
    const completed = onDay.filter((p) => p.completion).length;
    const overdue = onDay.filter((p) => practiceState(p) === 'missed' || practiceState(p) === 'due');
    return {
      date,
      assigned: onDay.length,
      completed,
      missedTitles: overdue.map((p) => p.title),
      missedPartsOfDay: overdue.map((p) => p.partOfDay),
    };
  });
}

/** Consecutive assigned-and-due practices not completed, most recent run. */
function missedStreak(state: EcosystemState, clientId: string): number {
  const due = practicesFor(state, clientId).filter((p) => practiceState(p) !== 'upcoming');
  let streak = 0;
  for (let i = due.length - 1; i >= 0; i -= 1) {
    if (due[i].completion) break;
    streak += 1;
  }
  return streak;
}

function lastReplyHours(thread: Thread | undefined): number | undefined {
  if (!thread) return undefined;
  for (let i = thread.messages.length - 1; i >= 0; i -= 1) {
    const reply = thread.messages[i];
    if (reply.author !== 'client') continue;
    const prompt = thread.messages
      .slice(0, i)
      .reverse()
      .find((m) => m.author === 'therapist');
    if (!prompt) return undefined;
    return (
      (new Date(reply.sentAt).getTime() - new Date(prompt.sentAt).getTime()) / 3_600_000
    );
  }
  return undefined;
}

export function buildSignals(state: EcosystemState, client: Client): EngagementSignals {
  const recentDays = buildDaySignals(state, client.id, 7);
  const window = recentDays.slice(-defaultEngagementConfig.window);
  const thread = state.threads.find((t) => t.clientId === client.id);
  const nextSession = nextSessionFor(state, client.id);

  return {
    usualCompletionRate: client.usualRhythm,
    recentDays,
    assignedRecent: window.reduce((sum, d) => sum + d.assigned, 0),
    completedRecent: window.reduce((sum, d) => sum + d.completed, 0),
    missedStreak: missedStreak(state, client.id),
    daysInactive: daysBetween(client.lastActiveAt),
    typicalReplyHours: client.typicalReplyHours,
    lastReplyHours: lastReplyHours(thread),
    sessionPrep: nextSession
      ? {
          answered: nextSession.prepPrompts.filter((q) => q.answer).length,
          total: nextSession.prepPrompts.length,
        }
      : undefined,
    resourceOpens: state.events.filter(
      (e) => e.clientId === client.id && e.kind === 'resource-opened' && daysBetween(e.at) <= 3,
    ).length,
    weeksTogether: client.weeksTogether,
  };
}

export function readingFor(state: EcosystemState, clientId: string): EngagementReading {
  const client = state.clients.find((c) => c.id === clientId)!;
  return evaluateEngagement(buildSignals(state, client));
}

export interface ClientWithReading {
  client: Client;
  reading: EngagementReading;
  nextSession?: Session;
  unread: number;
}

export function clientsWithReadings(state: EcosystemState): ClientWithReading[] {
  return state.clients.map((client) => ({
    client,
    reading: readingFor(state, client.id),
    nextSession: nextSessionFor(state, client.id),
    unread: unreadForTherapist(state, client.id),
  }));
}

/* --------------------------------------------------------------- sessions */

export const sessionsFor = (state: EcosystemState, clientId: string): Session[] =>
  state.sessions
    .filter((s) => s.clientId === clientId)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

export function nextSessionFor(state: EcosystemState, clientId: string): Session | undefined {
  return sessionsFor(state, clientId).find(
    (s) => s.status === 'upcoming' && new Date(s.startsAt) >= DEMO_NOW,
  );
}

export function lastSessionFor(state: EcosystemState, clientId: string): Session | undefined {
  return sessionsFor(state, clientId)
    .filter((s) => new Date(s.startsAt) < DEMO_NOW)
    .pop();
}

export function todaysSessions(state: EcosystemState): Session[] {
  const today = toISODate(DEMO_NOW);
  return state.sessions
    .filter((s) => toISODate(s.startsAt) === today)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
}

/** Everything scheduled beyond today — today has its own view. */
export function upcomingSessions(state: EcosystemState): Session[] {
  const today = toISODate(DEMO_NOW);
  return state.sessions
    .filter((s) => s.status === 'upcoming' && toISODate(s.startsAt) > today)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
}

export function pastSessions(state: EcosystemState): Session[] {
  return state.sessions
    .filter((s) => new Date(s.startsAt) < DEMO_NOW)
    .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());
}

export const prepProgress = (session: Session) => ({
  answered: session.prepPrompts.filter((q) => q.answer).length,
  total: session.prepPrompts.length,
});

/* --------------------------------------------------------------- messages */

export const threadFor = (state: EcosystemState, clientId: string): Thread | undefined =>
  state.threads.find((t) => t.clientId === clientId);

export const unreadForTherapist = (state: EcosystemState, clientId: string): number =>
  threadFor(state, clientId)?.messages.filter((m) => m.author === 'client' && !m.readByTherapist)
    .length ?? 0;

export const unreadForClient = (state: EcosystemState, clientId: string): number =>
  threadFor(state, clientId)?.messages.filter((m) => m.author === 'therapist' && !m.readByClient)
    .length ?? 0;

export const totalUnreadForTherapist = (state: EcosystemState): number =>
  state.clients.reduce((sum, c) => sum + unreadForTherapist(state, c.id), 0);

/* ----------------------------------------------------------------- notes */

export const notesFor = (state: EcosystemState, clientId: string) =>
  state.notes
    .filter((n) => n.clientId === clientId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

/* ---------------------------------------------------------------- events */

export function recentActivity(state: EcosystemState, limit = 12): ActivityEvent[] {
  return state.events.filter((e) => new Date(e.at) <= DEMO_NOW).slice(0, limit);
}

export const activityFor = (state: EcosystemState, clientId: string, limit = 20) =>
  state.events.filter((e) => e.clientId === clientId && new Date(e.at) <= DEMO_NOW).slice(0, limit);

/* --------------------------------------------------------------- journey */

export const chaptersForClient = (state: EcosystemState, clientId: string) =>
  state.chapters
    .filter((c) => c.clientId === clientId)
    .sort((a, b) => a.weekFrom - b.weekFrom);

/* -------------------------------------------------------------- resources */

export const resourcesForClient = (state: EcosystemState, clientId: string) => {
  const assigned = new Set(
    practicesFor(state, clientId)
      .map((p) => p.resourceId)
      .filter(Boolean) as string[],
  );
  return state.resources.filter((r) => assigned.has(r.id) || r.clientsUsing.includes(clientId));
};
