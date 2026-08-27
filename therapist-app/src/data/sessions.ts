import type { Session, SessionMode, SessionPrepState, SessionStatus } from '@/types';

/**
 * Seeded appointments are written in their readable form and completed here, so
 * the literals stay legible while every stored record carries the full shape a
 * backend would return.
 */
interface SessionSeed {
  id: string;
  clientId: string;
  startsAt: string;
  durationMin: number;
  mode: SessionMode;
  focus: string;
  status: SessionStatus;
  prepState: SessionPrepState;
  seriesId?: string;
  location?: string;
  preSession?: { question: string; answer: string }[];
  actionItems?: { id: string; text: string; done: boolean }[];
  privateNotes?: string;
  cancelledReason?: string;
  cancelledBy?: 'practitioner' | 'client';
  bookingSource?: Session['bookingSource'];
  createdBy?: Session['createdBy'];
  noteForClient?: string;
}

const complete = (seed: SessionSeed): Session => ({
  ...seed,
  practitionerId: 'john',
  endsAt: new Date(new Date(seed.startsAt).getTime() + seed.durationMin * 60_000).toISOString(),
  videoUrl: seed.mode === 'video' ? 'https://meet.example.com/rbr/' + seed.id : undefined,
  createdBy: seed.createdBy ?? 'practitioner',
  bookingSource: seed.bookingSource ?? (seed.seriesId ? 'recurring' : 'practitioner'),
  createdAt: new Date(new Date(seed.startsAt).getTime() - 12 * 86_400_000).toISOString(),
  updatedAt: new Date(new Date(seed.startsAt).getTime() - 12 * 86_400_000).toISOString(),
});

const PRE_SESSION_QUESTIONS = [
  'How have you been feeling since we last met?',
  'Is there anything you would like to make space for today?',
  'Was there a practice that felt particularly useful?',
];

const answers = (a: string, b: string, c: string) =>
  PRE_SESSION_QUESTIONS.map((question, i) => ({ question, answer: [a, b, c][i] }));

export const preSessionQuestions = PRE_SESSION_QUESTIONS;

const seeds: SessionSeed[] = [
  /* ------------------------------------------------------- today, Aug 26 */
  {
    id: 'se-emma-0826',
    clientId: 'emma',
    startsAt: '2026-08-26T10:30:00',
    durationMin: 60,
    mode: 'video',
    focus: 'Anxiety',
    status: 'scheduled',
    prepState: 'prep-ready',
    preSession: answers(
      'Evenings have been the hard part. Mornings are still holding.',
      'How to close out work without carrying it into the night.',
      'The breathing one. It is short enough that it actually happens.',
    ),
    actionItems: [
      { id: 'ai-emma-1', text: 'Try the 5-4-3-2-1 sequence at the point work ends', done: true },
      { id: 'ai-emma-2', text: 'Keep the evening reflection to one line on hard days', done: false },
    ],
  },
  {
    id: 'se-daniel-0826',
    clientId: 'daniel',
    startsAt: '2026-08-26T14:00:00',
    durationMin: 50,
    mode: 'in-person',
    focus: 'Depression',
    status: 'scheduled',
    prepState: 'notes-to-review',
    actionItems: [{ id: 'ai-daniel-1', text: 'Reduce the plan to the walk only if the week is heavy', done: false }],
  },
  {
    id: 'se-sophie-0826',
    clientId: 'sophie',
    startsAt: '2026-08-26T16:30:00',
    durationMin: 60,
    mode: 'video',
    focus: 'Self Esteem',
    status: 'scheduled',
    prepState: 'reflection-available',
    preSession: answers(
      'Steadier. I said no to something on Monday and it was fine.',
      'What happens when saying no costs something real.',
      'Naming a need. Writing it first makes it easier to say.',
    ),
  },

  /* ------------------------------------------------------------ upcoming */
  {
    id: 'se-emma-0828',
    clientId: 'emma',
    startsAt: '2026-08-28T10:30:00',
    durationMin: 60,
    mode: 'video',
    focus: 'Anxiety',
    status: 'scheduled',
    prepState: 'not-started',
  },
  {
    id: 'se-maya-0827',
    clientId: 'maya',
    startsAt: '2026-08-27T13:00:00',
    durationMin: 50,
    mode: 'video',
    focus: 'Burnout',
    status: 'scheduled',
    prepState: 'not-started',
  },
  {
    id: 'se-liam-0827',
    clientId: 'liam',
    startsAt: '2026-08-27T15:30:00',
    durationMin: 60,
    mode: 'in-person',
    focus: 'Trauma',
    status: 'scheduled',
    prepState: 'prep-ready',
    preSession: answers(
      'Level. The scan has been happening most mornings.',
      'The evening one — it still gets skipped.',
      'The body scan, when it is ten minutes rather than twenty.',
    ),
  },
  {
    id: 'se-grace-0828',
    clientId: 'grace',
    startsAt: '2026-08-28T09:00:00',
    durationMin: 50,
    mode: 'video',
    focus: 'OCD',
    status: 'scheduled',
    prepState: 'prep-ready',
    preSession: answers(
      'The delays are getting shorter to sit through.',
      'Whether the written record is still doing anything.',
      'The four rounds, at the point the delay gets hard.',
    ),
  },
  {
    id: 'se-olivia-0831',
    clientId: 'olivia',
    startsAt: '2026-08-31T11:00:00',
    durationMin: 60,
    mode: 'in-person',
    focus: 'Grief',
    status: 'scheduled',
    prepState: 'not-started',
  },
  {
    id: 'se-noah-0831',
    clientId: 'noah',
    startsAt: '2026-08-31T17:30:00',
    durationMin: 50,
    mode: 'video',
    focus: 'Anxiety',
    status: 'scheduled',
    prepState: 'not-started',
  },
  {
    id: 'se-lucas-0901',
    clientId: 'lucas',
    startsAt: '2026-08-31T17:00:00',
    durationMin: 50,
    mode: 'video',
    focus: 'Relationship',
    status: 'scheduled',
    prepState: 'not-started',
    bookingSource: 'client-request',
    createdBy: 'client',
  },
  /* The appointment that makes the 11:00 slot unavailable on 1 September. */
  {
    id: 'se-daniel-0901',
    clientId: 'daniel',
    startsAt: '2026-09-01T11:00:00',
    durationMin: 50,
    mode: 'in-person',
    focus: 'Depression',
    status: 'scheduled',
    prepState: 'not-started',
    location: 'Practice room',
  },
  {
    id: 'se-sophie-0902',
    clientId: 'sophie',
    startsAt: '2026-09-02T16:30:00',
    durationMin: 60,
    mode: 'video',
    focus: 'Self Esteem',
    status: 'scheduled',
    prepState: 'not-started',
  },
  /* Kept in history rather than deleted, as cancellations should be. */
  {
    id: 'se-maya-0819-cancelled',
    clientId: 'maya',
    startsAt: '2026-08-13T13:00:00',
    durationMin: 50,
    mode: 'video',
    focus: 'Burnout',
    status: 'cancelled',
    prepState: 'not-started',
    cancelledBy: 'client',
    cancelledReason: 'Work travel moved at short notice.',
  },

  /* ---------------------------------------------------------------- past */
  {
    id: 'se-emma-0821',
    clientId: 'emma',
    startsAt: '2026-08-21T10:30:00',
    durationMin: 60,
    mode: 'video',
    focus: 'Anxiety',
    status: 'completed',
    prepState: 'reflection-available',
    privateNotes:
      'Evening transition is where the week comes apart. Agreed to keep the evening pair for two more weeks before reviewing the load. Emma named Wednesday as the hardest day to protect.',
    actionItems: [
      { id: 'ai-emma-3', text: 'Introduce the 5-4-3-2-1 sequence at the end of the working day', done: true },
      { id: 'ai-emma-4', text: 'Share the nighttime rumination guide', done: true },
    ],
  },
  {
    id: 'se-emma-0814',
    clientId: 'emma',
    startsAt: '2026-08-14T10:30:00',
    durationMin: 60,
    mode: 'video',
    focus: 'Anxiety',
    status: 'completed',
    prepState: 'reflection-available',
    privateNotes:
      'Sleep onset improving on the days the evening pair happens. Emma links harder evenings to late work calls rather than to sleep itself.',
  },
  {
    id: 'se-daniel-0819',
    clientId: 'daniel',
    startsAt: '2026-08-19T14:00:00',
    durationMin: 50,
    mode: 'in-person',
    focus: 'Depression',
    status: 'completed',
    prepState: 'notes-to-review',
    privateNotes: 'Plan reduced to three items. Daniel predicted the midday step would be the first to go.',
  },
  {
    id: 'se-sophie-0819',
    clientId: 'sophie',
    startsAt: '2026-08-19T16:30:00',
    durationMin: 60,
    mode: 'video',
    focus: 'Self Esteem',
    status: 'completed',
    prepState: 'reflection-available',
    privateNotes: 'Rehearsed the sentence for the conversation she had been postponing.',
  },
  {
    id: 'se-liam-0820',
    clientId: 'liam',
    startsAt: '2026-08-20T15:30:00',
    durationMin: 60,
    mode: 'in-person',
    focus: 'Trauma',
    status: 'completed',
    prepState: 'prep-ready',
  },
  {
    id: 'se-maya-0820',
    clientId: 'maya',
    startsAt: '2026-08-20T13:00:00',
    durationMin: 50,
    mode: 'video',
    focus: 'Burnout',
    status: 'completed',
    prepState: 'notes-to-review',
    privateNotes: 'Midday pause is the practice most sensitive to her workload.',
  },
  {
    id: 'se-grace-0821',
    clientId: 'grace',
    startsAt: '2026-08-21T09:00:00',
    durationMin: 50,
    mode: 'video',
    focus: 'OCD',
    status: 'completed',
    prepState: 'prep-ready',
  },
  {
    id: 'se-olivia-0824',
    clientId: 'olivia',
    startsAt: '2026-08-24T11:00:00',
    durationMin: 60,
    mode: 'in-person',
    focus: 'Grief',
    status: 'completed',
    prepState: 'notes-to-review',
    privateNotes: 'The anniversary fell on the 22nd. We had planned for it; the plan mostly held.',
  },
  {
    id: 'se-noah-0824',
    clientId: 'noah',
    startsAt: '2026-08-24T17:30:00',
    durationMin: 50,
    mode: 'video',
    focus: 'Anxiety',
    status: 'completed',
    prepState: 'prep-ready',
  },
  {
    id: 'se-lucas-0825',
    clientId: 'lucas',
    startsAt: '2026-08-25T18:00:00',
    durationMin: 50,
    mode: 'video',
    focus: 'Relationship',
    status: 'completed',
    prepState: 'not-started',
    privateNotes: 'Second session. Still establishing what a normal week looks like.',
  },
];


export const sessions: Session[] = seeds.map(complete);
