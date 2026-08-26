import type { ActivityEvent, CheckIn, Practice, Reflection, Session } from '@/types';
import { findResource } from './resources';

/**
 * Recent activity is derived from the records themselves rather than stored
 * separately, so the stream can never drift out of sync with the data. Only
 * resource opens — which leave no other trace — are seeded.
 */
const seeded: ActivityEvent[] = [
  {
    id: 'ev-seed-1',
    clientId: 'emma',
    kind: 'resource-opened',
    label: 'Opened Navigating Nighttime Rumination',
    at: '2026-08-25T22:14:00',
  },
  {
    id: 'ev-seed-2',
    clientId: 'grace',
    kind: 'resource-opened',
    label: 'Opened 4 7 8 Parasympathetic',
    at: '2026-08-26T09:34:00',
  },
  {
    id: 'ev-seed-3',
    clientId: 'liam',
    kind: 'resource-opened',
    label: 'Opened Evening Body Scan',
    at: '2026-08-26T06:58:00',
  },
];

export function buildEvents(
  practices: Practice[],
  reflections: Reflection[],
  checkIns: CheckIn[],
  sessions: Session[],
): ActivityEvent[] {
  const events: ActivityEvent[] = [...seeded];

  for (const practice of practices) {
    if (!practice.completedAt) continue;
    const resource = findResource(practice.resourceId);
    events.push({
      id: `ev-pr-${practice.id}`,
      clientId: practice.clientId,
      kind: 'practice-completed',
      label: `Completed ${practice.title}`,
      detail: resource ? resource.title : undefined,
      at: practice.completedAt,
    });
  }

  for (const reflection of reflections) {
    events.push({
      id: `ev-rf-${reflection.id}`,
      clientId: reflection.clientId,
      kind: reflection.source === 'pre-session' ? 'pre-session-completed' : 'reflection-submitted',
      label: reflection.source === 'pre-session' ? 'Completed session preparation' : 'Submitted a reflection',
      detail: reflection.body.slice(0, 92),
      at: reflection.submittedAt,
    });
  }

  for (const checkIn of checkIns) {
    if (checkIn.status !== 'sent' || !checkIn.sentAt) continue;
    events.push({
      id: `ev-ci-${checkIn.id}`,
      clientId: checkIn.clientId,
      kind: 'check-in-sent',
      label: 'You sent a gentle check in',
      detail: checkIn.body.slice(0, 92),
      at: checkIn.sentAt,
    });
  }

  for (const session of sessions) {
    if (session.status !== 'completed') continue;
    events.push({
      id: `ev-se-${session.id}`,
      clientId: session.clientId,
      kind: 'session-completed',
      label: 'Session completed',
      detail: session.focus,
      at: new Date(new Date(session.startsAt).getTime() + session.durationMin * 60_000).toISOString(),
    });
  }

  return events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}
