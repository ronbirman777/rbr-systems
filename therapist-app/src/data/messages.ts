import type { Message } from '@/types';

/**
 * The conversation between practitioner and client. A check-in is an ordinary
 * message the system helped draft — the kind only records where it came from,
 * never who sent it. A person always did.
 */
const sent = (
  id: string,
  clientId: string,
  author: 'practitioner' | 'client',
  at: string,
  body: string,
  kind: Message['kind'] = 'message',
): Message => ({
  id,
  clientId,
  author,
  body,
  kind,
  status: 'sent',
  createdAt: at,
  sentAt: at,
  readByPractitioner: author === 'practitioner',
  readByClient: author === 'client',
});

export const messages: Message[] = [
  /* ------------------------------------------------------------------ Emma */
  sent(
    'ms-emma-1',
    'emma',
    'practitioner',
    '2026-08-14T12:05:00',
    'Good to see you this morning. I have added the grounding sequence as the last thing in the day — it is short on purpose.',
  ),
  sent(
    'ms-emma-2',
    'emma',
    'client',
    '2026-08-14T18:41:00',
    'Thank you. I tried it tonight already and falling asleep took less time than usual.',
  ),
  sent(
    'ms-emma-3',
    'emma',
    'practitioner',
    '2026-08-21T11:40:00',
    'The evening pair held all week, which is not a small thing. See you Tuesday.',
  ),

  /* ---------------------------------------------------------------- Daniel */
  sent(
    'ms-daniel-1',
    'daniel',
    'practitioner',
    '2026-08-24T09:12:00',
    'Hi Daniel, no need to reply to this. Just a note to say the walk is the one that matters — everything else can wait until we speak.',
    'check-in',
  ),
  sent(
    'ms-daniel-2',
    'daniel',
    'client',
    '2026-08-19T16:40:00',
    'Understood about the three items. I will start tomorrow.',
  ),

  /* ----------------------------------------------------------------- Maya */
  sent(
    'ms-maya-1',
    'maya',
    'practitioner',
    '2026-08-25T16:42:00',
    'Hi Maya, I noticed the week has been full. Nothing to catch up on — we can reshape the plan when we speak on Thursday.',
    'check-in',
  ),
  {
    ...sent(
      'ms-maya-2',
      'maya',
      'client',
      '2026-08-25T22:14:00',
      'This week got away from me completely. I will block the pause properly from Monday.',
    ),
    readByPractitioner: false,
  },

  /* --------------------------------------------------------------- Olivia */
  sent(
    'ms-olivia-1',
    'olivia',
    'practitioner',
    '2026-08-21T10:06:00',
    'Hi Olivia, thinking of you around the 22nd. No reply needed at all.',
    'check-in',
  ),
  {
    ...sent(
      'ms-olivia-2',
      'olivia',
      'client',
      '2026-08-26T07:30:00',
      'It passed more gently than last year. Thank you for remembering.',
    ),
    readByPractitioner: false,
  },

  /* --------------------------------------------------------------- Sophie */
  sent(
    'ms-sophie-1',
    'sophie',
    'practitioner',
    '2026-08-19T18:00:00',
    'Whenever the conversation happens, it does not need to go perfectly.',
  ),
  sent(
    'ms-sophie-2',
    'sophie',
    'client',
    '2026-08-26T09:06:00',
    'I had it on Monday. Awkward for four seconds and then completely fine.',
  ),

  /* ----------------------------------------------------------------- Liam */
  sent(
    'ms-liam-1',
    'liam',
    'practitioner',
    '2026-08-20T17:10:00',
    'The orienting practice can be as short as a minute on harder evenings.',
  ),
  sent('ms-liam-2', 'liam', 'client', '2026-08-21T08:20:00', 'Noted. A minute is more likely to happen.'),

  /* ---------------------------------------------------------------- Grace */
  sent(
    'ms-grace-1',
    'grace',
    'practitioner',
    '2026-08-21T10:15:00',
    'The second reading is arriving faster now — that is the whole point of the practice.',
  ),

  /* ----------------------------------------------------------------- Noah */
  sent('ms-noah-1', 'noah', 'practitioner', '2026-08-24T18:40:00', 'The step you chose this week is a good one.'),

  /* ---------------------------------------------------------------- Lucas */
  sent(
    'ms-lucas-1',
    'lucas',
    'practitioner',
    '2026-08-25T19:00:00',
    'One breath is enough. It is not about the length of the pause.',
  ),
];
