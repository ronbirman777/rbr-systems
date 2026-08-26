import type { Client, Practitioner } from '@/types';
import { monogram } from '@/utils/format';

/**
 * The references show people by given name only, with a two-letter monogram
 * (Emma → EM, Daniel → DA). Family names are held for a future real account and
 * are deliberately not surfaced anywhere in the interface.
 */

export const practitioner: Practitioner = {
  id: 'john',
  role: 'practitioner',
  name: 'John',
  familyName: 'Miller',
  initials: 'JO',
  title: 'Practitioner',
};

type Seed = Omit<Client, 'role' | 'initials'>;

const seeds: Seed[] = [
  {
    id: 'emma',
    name: 'Emma',
    familyName: 'Wilson',
    focus: 'Anxiety',
    focusDetail: 'Somatic anxiety triggers and evening transition routines',
    startedOn: '2026-06-24',
    weeksTogether: 9,
    usualRhythm: 91,
    baselineDays: 21,
    lastActivityAt: '2026-08-26T08:12:00',
    summary: 'Recent activity is noticeably different from Emma’s usual rhythm.',
    timezone: 'Europe/Lisbon',
  },
  {
    id: 'daniel',
    name: 'Daniel',
    familyName: 'Harris',
    focus: 'Depression',
    focusDetail: 'Morning activation and keeping the first hour small',
    startedOn: '2026-05-13',
    weeksTogether: 15,
    usualRhythm: 74,
    baselineDays: 21,
    lastActivityAt: '2026-08-22T09:40:00',
    summary: 'No practice activity recorded since Saturday.',
    timezone: 'Europe/Lisbon',
  },
  {
    id: 'sophie',
    name: 'Sophie',
    familyName: 'Martin',
    focus: 'Self Esteem',
    focusDetail: 'Naming a need before agreeing to something',
    startedOn: '2026-04-08',
    weeksTogether: 20,
    usualRhythm: 88,
    baselineDays: 21,
    lastActivityAt: '2026-08-26T09:04:00',
    summary: 'Sophie has completed assigned practices consistently over the last 12 days.',
    timezone: 'Europe/Lisbon',
  },
  {
    id: 'liam',
    name: 'Liam',
    familyName: 'Carter',
    focus: 'Trauma',
    focusDetail: 'Short, predictable intervals with sensation',
    startedOn: '2026-03-04',
    weeksTogether: 25,
    usualRhythm: 81,
    baselineDays: 21,
    lastActivityAt: '2026-08-26T07:02:00',
    summary: 'The body scan has been steady for three weeks.',
    timezone: 'Europe/Lisbon',
  },
  {
    id: 'maya',
    name: 'Maya',
    familyName: 'Thompson',
    focus: 'Burnout',
    focusDetail: 'Protecting one boundary inside the working day',
    startedOn: '2026-07-01',
    weeksTogether: 8,
    usualRhythm: 84,
    baselineDays: 21,
    lastActivityAt: '2026-08-26T08:38:00',
    summary: 'The midday pause has been skipped on the busier days.',
    timezone: 'Europe/Lisbon',
  },
  {
    id: 'olivia',
    name: 'Olivia',
    familyName: 'Reed',
    focus: 'Grief',
    focusDetail: 'Marking dates deliberately rather than being caught by them',
    startedOn: '2026-05-06',
    weeksTogether: 16,
    usualRhythm: 79,
    baselineDays: 21,
    lastActivityAt: '2026-08-26T07:26:00',
    summary: 'Picked her practices back up after a quiet stretch.',
    timezone: 'Europe/Lisbon',
  },
  {
    id: 'noah',
    name: 'Noah',
    familyName: 'Bennett',
    focus: 'Anxiety',
    focusDetail: 'One small exposure step each week',
    startedOn: '2026-04-29',
    weeksTogether: 17,
    usualRhythm: 76,
    baselineDays: 21,
    lastActivityAt: '2026-08-26T08:20:00',
    summary: 'Steady through a demanding fortnight.',
    timezone: 'Europe/Lisbon',
  },
  {
    id: 'grace',
    name: 'Grace',
    familyName: 'Miller',
    focus: 'OCD',
    focusDetail: 'Delaying the response, then shortening the delay',
    startedOn: '2026-01-14',
    weeksTogether: 32,
    usualRhythm: 93,
    baselineDays: 21,
    lastActivityAt: '2026-08-26T07:12:00',
    summary: 'The most consistent rhythm in the practice.',
    timezone: 'Europe/Lisbon',
  },
  {
    id: 'lucas',
    name: 'Lucas',
    familyName: 'Anderson',
    focus: 'Relationship',
    focusDetail: 'One breath before responding in a difficult exchange',
    startedOn: '2026-08-12',
    weeksTogether: 2,
    usualRhythm: 62,
    baselineDays: 21,
    lastActivityAt: '2026-08-25T21:40:00',
    summary: 'Two weeks in — a usual rhythm is still forming.',
    timezone: 'Europe/Lisbon',
  },
];

export const clients: Client[] = seeds.map((seed) => ({
  ...seed,
  role: 'client' as const,
  initials: monogram(seed.name),
}));

export const findClient = (id: string) => clients.find((c) => c.id === id);

/** The client the demo narrative follows. */
export const PRIMARY_CLIENT_ID = 'emma';
