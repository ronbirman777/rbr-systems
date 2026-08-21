import type { ActivityEvent, Practice, Session, Thread } from '@/types';
import { resourceById } from './mockResources';

/**
 * Events that are not derivable from practice or message records — resource
 * opens and session preparation. Everything else is built from the records
 * themselves so the stream can never drift out of sync with the data.
 */
const seededEvents: ActivityEvent[] = [
  {
    id: 'e-seed-1',
    clientId: 'emma',
    kind: 'resource-opened',
    label: 'Opened 4-7-8 Breathing',
    at: '2026-08-20T07:14:00',
    prominence: 'ambient',
  },
  {
    id: 'e-seed-2',
    clientId: 'emma',
    kind: 'session-prep',
    label: 'Answered 2 of 3 session preparation prompts',
    at: '2026-08-20T19:27:00',
    prominence: 'notable',
  },
  {
    id: 'e-seed-3',
    clientId: 'grace',
    kind: 'resource-opened',
    label: 'Opened Cognitive Reframing Worksheet',
    at: '2026-08-21T07:02:00',
    prominence: 'ambient',
  },
  {
    id: 'e-seed-4',
    clientId: 'liam',
    kind: 'resource-opened',
    label: 'Opened Body Scan',
    at: '2026-08-21T06:44:00',
    prominence: 'ambient',
  },
  {
    id: 'e-seed-5',
    clientId: 'olivia',
    kind: 'resource-opened',
    label: 'Opened Letters That Are Not Sent',
    at: '2026-08-21T07:12:00',
    prominence: 'ambient',
  },
  {
    id: 'e-seed-6',
    clientId: 'sophie',
    kind: 'session-prep',
    label: 'Answered all 3 session preparation prompts',
    at: '2026-08-20T20:10:00',
    prominence: 'notable',
  },
];

export function buildInitialEvents(
  practices: Practice[],
  threads: Thread[],
  sessions: Session[],
): ActivityEvent[] {
  const events: ActivityEvent[] = [...seededEvents];

  for (const practice of practices) {
    if (!practice.completion) continue;
    const resource = resourceById(practice.resourceId);
    events.push({
      id: `e-done-${practice.id}`,
      clientId: practice.clientId,
      kind: 'practice-completed',
      label: `Completed ${practice.title}`,
      detail: resource ? `Using ${resource.title}` : undefined,
      at: practice.completion.completedAt,
      prominence: 'ambient',
      meta: { practiceId: practice.id },
    });
    if (practice.completion.reflection?.visibility === 'shared') {
      events.push({
        id: `e-refl-${practice.id}`,
        clientId: practice.clientId,
        kind: 'reflection-shared',
        label: 'Shared a reflection with you',
        detail: practice.title,
        at: practice.completion.completedAt,
        prominence: 'notable',
        meta: { practiceId: practice.id },
      });
    }
  }

  for (const thread of threads) {
    for (const message of thread.messages) {
      events.push({
        id: `e-msg-${message.id}`,
        clientId: thread.clientId,
        kind:
          message.author === 'client'
            ? 'message-received'
            : message.kind === 'check-in'
              ? 'check-in-sent'
              : 'message-sent',
        label:
          message.author === 'client'
            ? 'Replied to you'
            : message.kind === 'check-in'
              ? 'You sent a check-in'
              : 'You sent a message',
        detail: message.body.slice(0, 90),
        at: message.sentAt,
        prominence: message.author === 'client' ? 'notable' : 'ambient',
      });
    }
  }

  for (const session of sessions) {
    if (session.status !== 'completed') continue;
    events.push({
      id: `e-sess-${session.id}`,
      clientId: session.clientId,
      kind: 'session-completed',
      label: 'Session completed',
      detail: session.focus,
      at: new Date(new Date(session.startsAt).getTime() + session.durationMin * 60_000).toISOString(),
      prominence: 'ambient',
    });
  }

  return events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}
