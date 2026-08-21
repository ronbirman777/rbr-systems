import type { PartOfDay, PracticeType, ReflectionVisibility } from '@/types';

/**
 * A client's standing plan. Repeating items are expanded into one dated
 * `Practice` record per day by `mockPractices.ts`, which keeps completion
 * unambiguous and lets the engagement engine read real per-day counts.
 */
export interface PlanItem {
  key: string;
  type: PracticeType;
  title: string;
  instructions: string;
  /** 24h local `HH:MM`. */
  time: string;
  partOfDay: PartOfDay;
  durationMin: number;
  resourceId?: string;
  invitesReflection?: boolean;
  message?: string;
  /** 0 = Sunday. Omit for every day. */
  weekdays?: number[];
  /** Minutes after the scheduled time that this client usually completes it. */
  usualDelayMin?: number;
  /** Reflections written on specific days, keyed by day offset from today. */
  reflections?: Record<number, { text: string; visibility: ReflectionVisibility }>;
}

export interface ClientPlan {
  clientId: string;
  items: PlanItem[];
  /** Keys completed on a given day offset (0 = today, -1 = yesterday). */
  completed: Record<number, string[]>;
  /** Fallback for offsets without an explicit entry: 'all' or a key list. */
  defaultCompleted: 'all' | string[];
}

const WEEKDAYS = [1, 2, 3, 4, 5];
const MON_TO_THU = [1, 2, 3, 4];

export const plans: ClientPlan[] = [
  {
    clientId: 'emma',
    items: [
      {
        key: 'breath',
        type: 'breathing',
        title: 'Morning breathing',
        instructions:
          'Four rounds of the 4-7-8 breath before anything else opens — phone, messages, the day. If four feels long, two is a complete practice.',
        time: '07:00',
        partOfDay: 'morning',
        durationMin: 6,
        resourceId: 'res-478',
        usualDelayMin: 14,
      },
      {
        key: 'stillness',
        type: 'meditation',
        title: 'Ten minutes of stillness',
        instructions:
          'Somewhere you will not be found for ten minutes. You are not aiming for a quiet mind — only for staying seated while it is loud.',
        time: '12:30',
        partOfDay: 'midday',
        durationMin: 10,
        resourceId: 'res-bodyscan',
        usualDelayMin: 8,
      },
      {
        key: 'reflection',
        type: 'reflection',
        title: 'Evening reflection',
        instructions:
          'Three prompts for closing the day without solving it. Write as little as you like — one line is a real answer.',
        time: '18:30',
        partOfDay: 'evening',
        durationMin: 8,
        resourceId: 'res-sleep-reflection',
        invitesReflection: true,
        usualDelayMin: 22,
        message: 'Whatever you write here is yours first. Share it only if you want to.',
        reflections: {
          '-3': {
            text: 'Slept better than I expected. Still woke at four but went back down without the spiral.',
            visibility: 'private',
          },
          '-2': {
            text: 'Work call went badly and I noticed I was already rehearsing the next one at dinner. Caught it earlier than I usually do.',
            visibility: 'shared',
          },
          '-6': {
            text: 'A slow Saturday. Nothing to report, which felt like something.',
            visibility: 'private',
          },
        } as Record<number, { text: string; visibility: ReflectionVisibility }>,
      },
      {
        key: 'grounding',
        type: 'grounding',
        title: 'Evening grounding',
        instructions:
          'The 5-4-3-2-1 sequence, in bed or just before. If you fall asleep partway through, that is a fine outcome.',
        time: '21:00',
        partOfDay: 'evening',
        durationMin: 5,
        resourceId: 'res-grounding',
        usualDelayMin: 16,
      },
    ],
    completed: {
      0: [],
      '-1': ['breath', 'stillness'],
      '-2': ['breath', 'stillness', 'reflection'],
      '-5': ['breath', 'stillness', 'grounding'],
      '-8': ['breath', 'reflection', 'grounding'],
      '-11': ['stillness', 'reflection', 'grounding'],
    },
    defaultCompleted: 'all',
  },
  {
    clientId: 'daniel',
    items: [
      {
        key: 'walk',
        type: 'grounding',
        title: 'Ten minutes outside',
        instructions: 'Out the door within an hour of waking. The distance does not matter.',
        time: '08:00',
        partOfDay: 'morning',
        durationMin: 10,
        usualDelayMin: 55,
      },
      {
        key: 'small-step',
        type: 'reading',
        title: 'One small step',
        instructions: 'Choose one thing under ten minutes. Decide when, not whether.',
        time: '11:00',
        partOfDay: 'midday',
        durationMin: 10,
        resourceId: 'res-small-steps',
        weekdays: WEEKDAYS,
        usualDelayMin: 40,
      },
      {
        key: 'evening-note',
        type: 'journal',
        title: 'One line about today',
        instructions: 'A single sentence. Flat days count.',
        time: '20:00',
        partOfDay: 'evening',
        durationMin: 4,
        invitesReflection: true,
        usualDelayMin: 35,
      },
    ],
    completed: { 0: [], '-1': [], '-2': [], '-3': [], '-4': ['walk'], '-7': ['walk', 'evening-note'] },
    defaultCompleted: 'all',
  },
  {
    clientId: 'sophie',
    items: [
      {
        key: 'intention',
        type: 'reflection',
        title: 'Morning intention',
        instructions: 'One sentence: what will you protect today?',
        time: '07:30',
        partOfDay: 'morning',
        durationMin: 4,
        invitesReflection: true,
        usualDelayMin: 12,
        reflections: {
          0: {
            text: 'Today I am protecting the hour after work before I answer anyone.',
            visibility: 'shared',
          },
        } as Record<number, { text: string; visibility: ReflectionVisibility }>,
      },
      {
        key: 'boundary',
        type: 'journal',
        title: 'Naming a need',
        instructions: 'Note one moment where you said the need out loud, or noticed you did not.',
        time: '13:00',
        partOfDay: 'midday',
        durationMin: 6,
        resourceId: 'res-boundaries',
        weekdays: MON_TO_THU,
        usualDelayMin: 25,
      },
      {
        key: 'evening-reflection',
        type: 'reflection',
        title: 'Evening reflection',
        instructions: 'What did the day cost, and what did it give back?',
        time: '19:00',
        partOfDay: 'evening',
        durationMin: 8,
        weekdays: MON_TO_THU,
        usualDelayMin: 30,
      },
    ],
    completed: { 0: ['intention'], '-1': ['intention', 'boundary'], '-2': ['intention'] },
    defaultCompleted: 'all',
  },
  {
    clientId: 'liam',
    items: [
      {
        key: 'body-scan',
        type: 'audio',
        title: 'Body scan',
        instructions: 'Fifteen minutes, or stop at the point where staying becomes work.',
        time: '06:45',
        partOfDay: 'morning',
        durationMin: 15,
        resourceId: 'res-bodyscan',
        usualDelayMin: 13,
      },
      {
        key: 'evening-orientation',
        type: 'grounding',
        title: 'Orienting to the room',
        instructions: 'Turn your head slowly. Let your eyes land where they want to land.',
        time: '21:30',
        partOfDay: 'evening',
        durationMin: 6,
        resourceId: 'res-window',
        usualDelayMin: 18,
      },
    ],
    completed: { 0: ['body-scan'], '-5': ['body-scan'], '-9': ['body-scan'] },
    defaultCompleted: 'all',
  },
  {
    clientId: 'maya',
    items: [
      {
        key: 'arrival',
        type: 'breathing',
        title: 'Arrival breath',
        instructions: 'Before the laptop opens. Three slow breaths, feet on the floor.',
        time: '07:45',
        partOfDay: 'morning',
        durationMin: 5,
        resourceId: 'res-478',
        usualDelayMin: 7,
      },
      {
        key: 'midday-pause',
        type: 'meditation',
        title: 'Midday pause',
        instructions: 'Ten minutes away from the screen, calendar blocked.',
        time: '13:00',
        partOfDay: 'midday',
        durationMin: 10,
        weekdays: WEEKDAYS,
        usualDelayMin: 35,
      },
      {
        key: 'close-of-day',
        type: 'journal',
        title: 'Closing the day',
        instructions: 'Write the one thing that is finished, even if much is not.',
        time: '19:30',
        partOfDay: 'evening',
        durationMin: 6,
        invitesReflection: true,
        usualDelayMin: 90,
      },
    ],
    completed: { 0: ['arrival'], '-2': ['arrival', 'close-of-day'], '-6': ['arrival'] },
    defaultCompleted: 'all',
  },
  {
    clientId: 'olivia',
    items: [
      {
        key: 'letters',
        type: 'journal',
        title: 'Letters that are not sent',
        instructions: 'Write as though it will be read. Stop where it becomes too much.',
        time: '07:15',
        partOfDay: 'morning',
        durationMin: 14,
        resourceId: 'res-letters',
        invitesReflection: true,
        usualDelayMin: 9,
      },
      {
        key: 'evening-walk',
        type: 'grounding',
        title: 'Evening walk',
        instructions: 'The same route. Noticing what has changed on it.',
        time: '19:00',
        partOfDay: 'evening',
        durationMin: 20,
        weekdays: MON_TO_THU,
        usualDelayMin: 20,
      },
    ],
    completed: { 0: ['letters'], '-6': [] },
    defaultCompleted: 'all',
  },
  {
    clientId: 'noah',
    items: [
      {
        key: 'morning-breath',
        type: 'breathing',
        title: 'Morning breath',
        instructions: 'Four rounds, before leaving the house.',
        time: '08:30',
        partOfDay: 'morning',
        durationMin: 5,
        resourceId: 'res-478',
        usualDelayMin: 20,
      },
      {
        key: 'exposure-step',
        type: 'reading',
        title: 'One small step',
        instructions: 'The step we agreed on. Note what happened afterwards in one line.',
        time: '17:00',
        partOfDay: 'evening',
        durationMin: 10,
        resourceId: 'res-small-steps',
        weekdays: [2, 4],
        invitesReflection: true,
        usualDelayMin: 60,
      },
    ],
    completed: { 0: [], '-9': [], '-10': [], '-11': [], '-12': [], '-13': [] },
    defaultCompleted: 'all',
  },
  {
    clientId: 'grace',
    items: [
      {
        key: 'reframe',
        type: 'questionnaire',
        title: 'Reframing worksheet',
        instructions: 'Situation, first thought, evidence, second reading.',
        time: '07:00',
        partOfDay: 'morning',
        durationMin: 12,
        resourceId: 'res-reframe',
        weekdays: WEEKDAYS,
        usualDelayMin: 6,
      },
      {
        key: 'evening-review',
        type: 'reflection',
        title: 'Evening review',
        instructions: 'Which thought arrived first today, and did the second one land?',
        time: '20:00',
        partOfDay: 'evening',
        durationMin: 7,
        usualDelayMin: 15,
      },
    ],
    completed: { 0: ['reframe'], '-6': ['evening-review'], '-7': ['evening-review'] },
    defaultCompleted: 'all',
  },
  {
    clientId: 'lucas',
    items: [
      {
        key: 'pause-practice',
        type: 'breathing',
        title: 'The pause before answering',
        instructions: 'One full breath before responding in any difficult exchange.',
        time: '12:00',
        partOfDay: 'midday',
        durationMin: 4,
        weekdays: WEEKDAYS,
        usualDelayMin: 130,
      },
      {
        key: 'evening-reflection',
        type: 'reflection',
        title: 'Evening reflection',
        instructions: 'Where did the pause hold today, and where did it not?',
        time: '21:30',
        partOfDay: 'evening',
        durationMin: 8,
        invitesReflection: true,
        usualDelayMin: 40,
      },
    ],
    completed: { 0: [], '-3': ['evening-reflection'], '-8': ['evening-reflection'] },
    defaultCompleted: 'all',
  },
];

export const planFor = (clientId: string): ClientPlan | undefined =>
  plans.find((p) => p.clientId === clientId);
