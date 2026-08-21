import type { Client, Practice, Session } from '@/types';
import type { EcosystemState } from '@/state/ecosystemReducer';
import { DEMO_NOW } from '@/utils/date';
import { practiceScheduledAt, practiceState, sessionsFor, threadFor } from './selectors';
import { plural, times } from '@/utils/format';

/**
 * The pre-session brief.
 *
 * It reports **observable activity only** — what was assigned, what was
 * completed, what was shared, what was said. It contains no interpretation of
 * how a client is doing, because that is the therapist's work, not the
 * system's. Every sentence here must survive the question "could this be
 * mistaken for a clinical judgement?".
 */
export interface SessionBrief {
  session: Session;
  client: Client;
  since?: Session;
  sinceLabel: string;
  assigned: number;
  completed: number;
  byPractice: { title: string; completed: number; due: number }[];
  sharedReflections: { title: string; text: string; at: string }[];
  privateReflectionCount: number;
  messagesFromClient: number;
  messagesFromTherapist: number;
  checkInsSent: number;
  prep: { answered: number; total: number; answers: { text: string; answer?: string }[] };
  /** Plain-language lines rendered as the body of the brief. */
  lines: string[];
}

const cap = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export function buildSessionBrief(state: EcosystemState, session: Session): SessionBrief {
  const client = state.clients.find((c) => c.id === session.clientId)!;
  const previous = sessionsFor(state, client.id)
    .filter((s) => new Date(s.startsAt) < new Date(session.startsAt) && new Date(s.startsAt) < DEMO_NOW)
    .pop();

  const from = previous ? new Date(previous.startsAt) : new Date(client.startedOn);
  const to = new Date(Math.min(DEMO_NOW.getTime(), new Date(session.startsAt).getTime()));

  const inWindow = (p: Practice) => {
    const at = practiceScheduledAt(p);
    return p.clientId === client.id && at > from && at <= to;
  };

  const window = state.practices.filter(inWindow);
  const due = window.filter((p) => practiceState(p) !== 'upcoming');
  const completed = due.filter((p) => p.completion);

  const titles = Array.from(new Set(due.map((p) => p.title)));
  const byPractice = titles
    .map((title) => ({
      title,
      due: due.filter((p) => p.title === title).length,
      completed: completed.filter((p) => p.title === title).length,
    }))
    .sort((a, b) => b.due - a.due);

  const sharedReflections = completed
    .filter((p) => p.completion?.reflection?.visibility === 'shared')
    .map((p) => ({
      title: p.title,
      text: p.completion!.reflection!.text,
      at: p.completion!.completedAt,
    }));

  const privateReflectionCount = completed.filter(
    (p) => p.completion?.reflection?.visibility === 'private',
  ).length;

  const thread = threadFor(state, client.id);
  const messages = (thread?.messages ?? []).filter((m) => {
    const at = new Date(m.sentAt);
    return at > from && at <= to;
  });

  const prepAnswers = session.prepPrompts.map((q) => ({ text: q.text, answer: q.answer }));
  const prep = {
    answered: session.prepPrompts.filter((q) => q.answer).length,
    total: session.prepPrompts.length,
    answers: prepAnswers,
  };

  const sinceLabel = previous
    ? `Since your last session on ${new Date(previous.startsAt).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      })}`
    : `Since you started working together`;

  const lines: string[] = [];
  lines.push(
    `${client.firstName} completed ${completed.length} of ${plural(due.length, 'assigned practice')}.`,
  );

  const steady = byPractice.filter((p) => p.due >= 2 && p.completed === p.due);
  for (const p of steady) lines.push(`${p.title} was completed every time it was assigned.`);

  const partial = byPractice.filter((p) => p.completed < p.due);
  for (const p of partial) {
    const missed = p.due - p.completed;
    lines.push(`${p.title} was not completed ${times(missed)} out of ${p.due}.`);
  }

  if (sharedReflections.length > 0) {
    lines.push(
      `${client.firstName} shared ${plural(sharedReflections.length, 'reflection', undefined, true)} with you.`,
    );
  }
  if (privateReflectionCount > 0) {
    lines.push(
      `${cap(plural(privateReflectionCount, 'further reflection', undefined, true))} ${
        privateReflectionCount === 1 ? 'was' : 'were'
      } written and kept private.`,
    );
  }

  const checkIns = messages.filter((m) => m.author === 'therapist' && m.kind === 'check-in').length;
  const fromTherapist = messages.filter((m) => m.author === 'therapist').length;
  const fromClient = messages.filter((m) => m.author === 'client').length;
  if (checkIns > 0) lines.push(`You sent ${plural(checkIns, 'check-in', undefined, true)}.`);
  if (fromTherapist - checkIns > 0) {
    lines.push(`You sent ${plural(fromTherapist - checkIns, 'message', undefined, true)}.`);
  }
  if (fromClient > 0) {
    lines.push(`${client.firstName} replied ${fromClient === 1 ? 'once' : times(fromClient)}.`);
  }
  if (prep.total > 0) {
    lines.push(`${prep.answered} of ${prep.total} session preparation prompts have been answered.`);
  }

  return {
    session,
    client,
    since: previous,
    sinceLabel,
    assigned: due.length,
    completed: completed.length,
    byPractice,
    sharedReflections,
    privateReflectionCount,
    messagesFromClient: fromClient,
    messagesFromTherapist: fromTherapist,
    checkInsSent: checkIns,
    prep,
    lines,
  };
}
