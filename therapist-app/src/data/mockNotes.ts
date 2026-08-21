import type { PrivateNote } from '@/types';

/**
 * Therapist-only records. Nothing in `routes/client/**` may import this file —
 * the boundary is enforced by keeping notes out of the client selectors.
 */
export const privateNotes: PrivateNote[] = [
  {
    id: 'n-emma-1',
    clientId: 'emma',
    type: 'session',
    body: 'Sleep onset continues to improve on the days the evening pair happens. Emma links the harder evenings to late work calls rather than to sleep itself.',
    createdAt: '2026-08-18T11:35:00',
    authorId: 'john',
  },
  {
    id: 'n-emma-2',
    clientId: 'emma',
    type: 'observation',
    body: 'Worth asking whether four practices a day is the right load, or whether the evening pair should collapse into one on weekdays.',
    createdAt: '2026-08-20T18:02:00',
    authorId: 'john',
  },
  {
    id: 'n-emma-3',
    clientId: 'emma',
    type: 'follow-up',
    body: 'Bring the Wednesday pattern to Friday’s session. Do not lead with it — let her raise the evenings first if she wants to.',
    createdAt: '2026-08-20T18:05:00',
    authorId: 'john',
  },
  {
    id: 'n-emma-4',
    clientId: 'emma',
    type: 'progress',
    body: 'Twelve weeks in. Morning practice is now self-sustaining and no longer needs to be part of the assigned plan much longer.',
    createdAt: '2026-08-14T12:10:00',
    authorId: 'john',
  },
  {
    id: 'n-daniel-1',
    clientId: 'daniel',
    type: 'session',
    body: 'Plan reduced to three items on Monday. Daniel predicted the midday step would be the first to go — which matches what has happened.',
    createdAt: '2026-08-17T15:10:00',
    authorId: 'john',
  },
  {
    id: 'n-daniel-2',
    clientId: 'daniel',
    type: 'reminder',
    body: 'If the quiet stretch continues past today’s session, revisit whether the plan should drop to a single morning item.',
    createdAt: '2026-08-20T08:40:00',
    authorId: 'john',
  },
  {
    id: 'n-sophie-1',
    clientId: 'sophie',
    type: 'progress',
    body: 'The rehearsed sentence was used on Thursday. Sophie described the aftermath as "awkward and then fine" — worth returning to that phrase.',
    createdAt: '2026-08-21T07:55:00',
    authorId: 'john',
  },
  {
    id: 'n-maya-1',
    clientId: 'maya',
    type: 'observation',
    body: 'Midday pause is the practice most sensitive to her workload. Consider anchoring it to an existing calendar event instead of a time.',
    createdAt: '2026-08-19T16:20:00',
    authorId: 'john',
  },
  {
    id: 'n-liam-1',
    clientId: 'liam',
    type: 'session',
    body: 'Body scan tolerated at full length for three weeks. Orienting practice remains the more useful of the two on difficult evenings.',
    createdAt: '2026-08-17T16:30:00',
    authorId: 'john',
  },
  {
    id: 'n-grace-1',
    clientId: 'grace',
    type: 'progress',
    body: 'Reframing has become close to automatic. Discuss reducing the written worksheet to twice weekly.',
    createdAt: '2026-08-17T10:30:00',
    authorId: 'john',
  },
];
