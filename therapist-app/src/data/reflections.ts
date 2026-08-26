import type { Reflection } from '@/types';

/**
 * Written by clients. `privateThought` is the practitioner's own note attached
 * to a reflection — it is never rendered anywhere in the client experience.
 */
export const reflections: Reflection[] = [
  {
    id: 'rf-emma-3',
    clientId: 'emma',
    source: 'practice',
    title: 'Evening Reflection',
    body: 'Feeling overwhelmed in the evening when trying to close out work. There is a point around six where I can feel it change — the day is technically over but nothing has actually stopped. I keep opening the laptop again "just to finish one thing" and then it is nine and I have not eaten. The mornings are fine. It is the handover between the two parts of the day that I cannot seem to make.',
    submittedAt: '2026-08-24T19:26:00',
    privateThought:
      'The transition itself is the target, not the evening practices. Consider moving the grounding sequence to the point work ends rather than to bedtime.',
    readByPractitioner: true,
  },
  {
    id: 'rf-emma-2',
    clientId: 'emma',
    source: 'practice',
    title: 'Evening Reflection',
    body: 'Slept better than I expected. Still woke at four but went back down without the spiral, which has not happened in a while. I think the difference was that I had written the list before bed instead of holding it.',
    submittedAt: '2026-08-23T19:31:00',
    readByPractitioner: true,
  },
  {
    id: 'rf-emma-1',
    clientId: 'emma',
    source: 'pre-session',
    title: 'Before our session',
    body: 'Work has been loud. Evenings are the part that keeps slipping. I would like to leave the session having said that I think the evening plan might be too much on some days.',
    submittedAt: '2026-08-20T20:12:00',
    privateThought: 'She raised the load herself. Let her lead on reducing it rather than proposing it first.',
    readByPractitioner: true,
  },
  {
    id: 'rf-emma-0',
    clientId: 'emma',
    source: 'practice',
    title: 'Evening Reflection',
    body: 'A slow Saturday. Nothing to report, which felt like something.',
    submittedAt: '2026-08-15T19:24:00',
    readByPractitioner: true,
  },
  {
    id: 'rf-sophie-1',
    clientId: 'sophie',
    source: 'practice',
    title: 'Naming a Need',
    body: 'I said no to the Friday meeting. It was awkward for about four seconds and then it was completely fine. I had rehearsed a much longer sentence than the one I actually used.',
    submittedAt: '2026-08-26T09:04:00',
    readByPractitioner: false,
  },
  {
    id: 'rf-olivia-1',
    clientId: 'olivia',
    source: 'practice',
    title: 'Letters That Are Not Sent',
    body: 'Wrote to him on the anniversary, which I had said I would not do. Stopped halfway. That felt like the right place to stop rather than a failure to finish.',
    submittedAt: '2026-08-26T07:26:00',
    readByPractitioner: false,
  },
  {
    id: 'rf-maya-1',
    clientId: 'maya',
    source: 'practice',
    title: 'Closing the Day',
    body: 'This week got away from me. Monday was a write-off. I will block the pause properly from next week rather than hoping the gap appears.',
    submittedAt: '2026-08-24T20:40:00',
    readByPractitioner: true,
    privateThought: 'Anchor the pause to an existing calendar event rather than a time of day.',
  },
  {
    id: 'rf-liam-1',
    clientId: 'liam',
    source: 'practice',
    title: 'Morning note',
    body: 'Ten minutes is more likely to happen than twenty. I have been stopping at ten and it has been every day this week.',
    submittedAt: '2026-08-25T07:14:00',
    readByPractitioner: true,
  },
  {
    id: 'rf-grace-1',
    clientId: 'grace',
    source: 'practice',
    title: 'Evening Review',
    body: 'The delay held four times and did not hold once. The once was late in the evening when I was already tired.',
    submittedAt: '2026-08-25T20:16:00',
    readByPractitioner: true,
  },
];
