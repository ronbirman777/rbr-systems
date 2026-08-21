import type { Thread } from '@/types';

let seq = 0;
const msg = (
  threadId: string,
  author: 'therapist' | 'client',
  sentAt: string,
  body: string,
  opts: { readByTherapist?: boolean; readByClient?: boolean; kind?: 'message' | 'check-in' } = {},
) => ({
  id: `m-${threadId}-${(seq += 1)}`,
  threadId,
  author,
  body,
  sentAt,
  readByTherapist: opts.readByTherapist ?? true,
  readByClient: opts.readByClient ?? true,
  kind: opts.kind ?? ('message' as const),
});

export const threads: Thread[] = [
  {
    id: 't-emma',
    clientId: 'emma',
    messages: [
      msg(
        't-emma',
        'therapist',
        '2026-08-14T12:05:00',
        'Good to see you this morning, Emma. I have added the grounding sequence as the last thing in the day — it is short on purpose.',
      ),
      msg(
        't-emma',
        'client',
        '2026-08-14T18:41:00',
        'Thank you. I tried it tonight already. Falling asleep took less time than usual.',
      ),
      msg(
        't-emma',
        'therapist',
        '2026-08-17T09:10:00',
        'Morning Emma — the evening pair held all week, which is not a small thing. See you tomorrow at 10:30.',
      ),
      msg('t-emma', 'client', '2026-08-18T08:37:00', 'Thanks John. Sleep has been steadier. See you shortly.'),
      msg(
        't-emma',
        'therapist',
        '2026-08-20T17:20:00',
        'No reply needed to this one — just a note to say I hope the week is treating you gently.',
        { kind: 'check-in', readByClient: true },
      ),
    ],
  },
  {
    id: 't-daniel',
    clientId: 'daniel',
    messages: [
      msg(
        't-daniel',
        'therapist',
        '2026-08-17T16:40:00',
        'Good session today, Daniel. Three items only — and the walk is the one that matters most.',
      ),
      msg('t-daniel', 'client', '2026-08-17T21:02:00', 'Understood. I will start tomorrow.'),
    ],
  },
  {
    id: 't-sophie',
    clientId: 'sophie',
    messages: [
      msg('t-sophie', 'therapist', '2026-08-18T18:00:00', 'Whenever the conversation happens, it does not need to go perfectly.'),
      msg(
        't-sophie',
        'client',
        '2026-08-21T07:48:00',
        'I had it on Thursday. It was awkward and then it was fine. I have been back on the practices since.',
        { readByTherapist: false },
      ),
    ],
  },
  {
    id: 't-liam',
    clientId: 'liam',
    messages: [
      msg('t-liam', 'therapist', '2026-08-17T17:10:00', 'The orienting practice can be as short as a minute on harder evenings.'),
      msg('t-liam', 'client', '2026-08-18T08:20:00', 'Noted. A minute is more likely to happen.'),
    ],
  },
  {
    id: 't-maya',
    clientId: 'maya',
    messages: [
      msg('t-maya', 'therapist', '2026-08-18T14:20:00', 'The midday pause only works if it is in the calendar before the day fills.'),
      msg(
        't-maya',
        'client',
        '2026-08-20T22:14:00',
        'This week got away from me. Wednesday was a write-off. I will block it properly from Monday.',
        { readByTherapist: false },
      ),
    ],
  },
  {
    id: 't-olivia',
    clientId: 'olivia',
    messages: [
      msg('t-olivia', 'therapist', '2026-08-19T13:00:00', 'The letters do not have to arrive anywhere to do their work.'),
      msg('t-olivia', 'client', '2026-08-20T09:30:00', 'I wrote two this week. One I stopped halfway, which felt right.'),
    ],
  },
  {
    id: 't-noah',
    clientId: 'noah',
    messages: [
      msg('t-noah', 'therapist', '2026-08-18T18:40:00', 'Welcome, Noah. The first week is only about seeing what fits.'),
    ],
  },
  {
    id: 't-grace',
    clientId: 'grace',
    messages: [
      msg('t-grace', 'therapist', '2026-08-17T10:15:00', 'The second reading is arriving faster now — that is the whole point of the practice.'),
      msg('t-grace', 'client', '2026-08-17T15:22:00', 'It is. Sometimes before the first one finishes.'),
    ],
  },
  {
    id: 't-lucas',
    clientId: 'lucas',
    messages: [
      msg('t-lucas', 'therapist', '2026-08-19T19:00:00', 'One breath is enough. It is not about the length of the pause.'),
      msg('t-lucas', 'client', '2026-08-20T22:31:00', 'It held twice this week. Once it definitely did not.'),
    ],
  },
];
