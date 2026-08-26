import type { Assignment, PartOfDay, PracticeType } from '@/types';

/**
 * Standing assignments per client, with the completion history the demo needs.
 *
 * Repeating assignments are expanded into one dated `Practice` per day by
 * `data/practices.ts`, so completion is always unambiguous and the baseline
 * engine reads real per-day counts rather than invented percentages.
 */

export interface AssignmentSeed {
  key: string;
  type: PracticeType;
  title: string;
  instructions: string;
  targetTime: string;
  partOfDay: PartOfDay;
  durationMin: number;
  resourceId?: string;
  optional?: boolean;
  /** 0 = Sunday. Omit for every day. */
  days?: number[];
  /** Minutes after the target time this client usually completes it. */
  usualDelayMin?: number;
}

export interface ClientPlan {
  clientId: string;
  assignments: AssignmentSeed[];
  /** Keys completed, by day offset from today (0 = today, -1 = yesterday). */
  completed: Record<number, string[]>;
  /** Applied to any offset without an explicit entry. */
  fallback: 'all' | string[];
}

const WEEKDAYS = [1, 2, 3, 4, 5];

export const plans: ClientPlan[] = [
  {
    clientId: 'emma',
    assignments: [
      {
        key: 'grounding',
        type: 'meditation',
        title: 'Morning Grounding',
        instructions:
          'Five minutes seated, feet on the floor. You are not aiming for a quiet mind — only for staying seated while it is loud.',
        targetTime: '08:00',
        partOfDay: 'morning',
        durationMin: 5,
        resourceId: 'res-anchor',
        usualDelayMin: 22,
      },
      {
        key: 'breathing',
        type: 'breathing',
        title: '5 Minute Breathing',
        instructions:
          'Four rounds of the 4-7-8 breath before the day opens. If four feels long, two is a complete practice.',
        targetTime: '08:05',
        partOfDay: 'morning',
        durationMin: 5,
        resourceId: 'res-478',
        usualDelayMin: 7,
      },
      {
        key: 'reflection',
        type: 'journal',
        title: 'Evening Reflection',
        instructions:
          'Three prompts for closing the day without solving it. One line is a real answer.',
        targetTime: '19:00',
        partOfDay: 'evening',
        durationMin: 8,
        resourceId: 'res-unwind',
        usualDelayMin: 26,
      },
      {
        key: 'bodyscan',
        type: 'listen',
        title: 'Body Scan',
        instructions:
          'A slow pass through the body. If you fall asleep partway through, that is a fine outcome.',
        targetTime: '21:30',
        partOfDay: 'night',
        durationMin: 10,
        resourceId: 'res-bodyscan',
        optional: true,
        usualDelayMin: 15,
      },
    ],
    completed: {
      0: ['breathing'],
      '-1': ['grounding', 'breathing'],
      '-2': ['breathing'],
      '-3': ['grounding', 'breathing', 'reflection'],
      '-6': ['grounding', 'breathing', 'reflection'],
      '-9': ['grounding', 'breathing', 'bodyscan'],
      '-13': ['grounding', 'breathing', 'reflection'],
    },
    fallback: 'all',
  },
  {
    clientId: 'daniel',
    assignments: [
      {
        key: 'outside',
        type: 'meditation',
        title: 'Ten Minutes Outside',
        instructions: 'Out the door within an hour of waking. The distance does not matter.',
        targetTime: '08:30',
        partOfDay: 'morning',
        durationMin: 10,
        usualDelayMin: 55,
      },
      {
        key: 'step',
        type: 'reflection',
        title: 'One Small Step',
        instructions: 'Choose one thing under ten minutes. Decide when, not whether.',
        targetTime: '11:00',
        partOfDay: 'midday',
        durationMin: 10,
        days: WEEKDAYS,
        usualDelayMin: 40,
      },
      {
        key: 'line',
        type: 'journal',
        title: 'One Line About Today',
        instructions: 'A single sentence. Flat days count.',
        targetTime: '20:00',
        partOfDay: 'evening',
        durationMin: 4,
        usualDelayMin: 35,
      },
    ],
    completed: { 0: [], '-1': [], '-2': [], '-3': [], '-4': ['outside'], '-7': ['outside', 'line'] },
    fallback: 'all',
  },
  {
    clientId: 'sophie',
    assignments: [
      {
        key: 'intention',
        type: 'reflection',
        title: 'Morning Intention',
        instructions: 'One sentence: what will you protect today?',
        targetTime: '08:00',
        partOfDay: 'morning',
        durationMin: 4,
        usualDelayMin: 14,
      },
      {
        key: 'need',
        type: 'journal',
        title: 'Naming a Need',
        instructions: 'Note one moment where you said the need out loud, or noticed you did not.',
        targetTime: '09:00',
        partOfDay: 'morning',
        durationMin: 6,
        resourceId: 'res-boundaries',
        usualDelayMin: 9,
      },
      {
        key: 'evening',
        type: 'reflection',
        title: 'Evening Reflection',
        instructions: 'What did the day cost, and what did it give back?',
        targetTime: '19:30',
        partOfDay: 'evening',
        durationMin: 8,
        usualDelayMin: 22,
      },
    ],
    completed: { 0: ['intention', 'need'] },
    fallback: 'all',
  },
  {
    clientId: 'liam',
    assignments: [
      {
        key: 'scan',
        type: 'listen',
        title: 'Body Scan',
        instructions: 'Ten minutes, or stop at the point where staying becomes work.',
        targetTime: '07:00',
        partOfDay: 'morning',
        durationMin: 10,
        resourceId: 'res-bodyscan',
        usualDelayMin: 4,
      },
      {
        key: 'orient',
        type: 'breathing',
        title: 'Orienting to the Room',
        instructions: 'Turn your head slowly. Let your eyes land where they want to land.',
        targetTime: '21:00',
        partOfDay: 'evening',
        durationMin: 6,
        resourceId: 'res-window',
        usualDelayMin: 18,
      },
    ],
    completed: { 0: ['scan'], '-5': ['scan'], '-9': ['scan'] },
    fallback: 'all',
  },
  {
    clientId: 'maya',
    assignments: [
      {
        key: 'arrival',
        type: 'breathing',
        title: 'Arrival Breath',
        instructions: 'Before the laptop opens. Three slow breaths, feet on the floor.',
        targetTime: '08:30',
        partOfDay: 'morning',
        durationMin: 5,
        resourceId: 'res-478',
        usualDelayMin: 8,
      },
      {
        key: 'pause',
        type: 'meditation',
        title: 'Midday Pause',
        instructions: 'Ten minutes away from the screen, blocked in the calendar.',
        targetTime: '13:00',
        partOfDay: 'midday',
        durationMin: 10,
        days: WEEKDAYS,
        usualDelayMin: 35,
      },
      {
        key: 'close',
        type: 'journal',
        title: 'Closing the Day',
        instructions: 'Write the one thing that is finished, even if much is not.',
        targetTime: '19:30',
        partOfDay: 'evening',
        durationMin: 6,
        usualDelayMin: 70,
      },
    ],
    completed: { 0: ['arrival'], '-2': ['arrival', 'close'], '-6': ['arrival'] },
    fallback: 'all',
  },
  {
    clientId: 'olivia',
    assignments: [
      {
        key: 'letters',
        type: 'journal',
        title: 'Letters That Are Not Sent',
        instructions: 'Write as though it will be read. Stop where it becomes too much.',
        targetTime: '07:15',
        partOfDay: 'morning',
        durationMin: 12,
        resourceId: 'res-letters',
        usualDelayMin: 11,
      },
      {
        key: 'walk',
        type: 'meditation',
        title: 'Evening Walk',
        instructions: 'The same route. Noticing what has changed on it.',
        targetTime: '19:00',
        partOfDay: 'evening',
        durationMin: 20,
        usualDelayMin: 20,
      },
    ],
    completed: { 0: ['letters'], '-2': [], '-3': [], '-4': [], '-5': [] },
    fallback: 'all',
  },
  {
    clientId: 'noah',
    assignments: [
      {
        key: 'breath',
        type: 'breathing',
        title: 'Morning Breath',
        instructions: 'Four rounds, before leaving the house.',
        targetTime: '08:00',
        partOfDay: 'morning',
        durationMin: 5,
        resourceId: 'res-478',
        usualDelayMin: 20,
      },
      {
        key: 'step',
        type: 'reflection',
        title: 'One Small Step',
        instructions: 'The step we agreed on. Note what happened afterwards in one line.',
        targetTime: '17:00',
        partOfDay: 'evening',
        durationMin: 10,
        usualDelayMin: 50,
      },
    ],
    completed: { 0: ['breath'], '-4': ['breath'], '-8': ['breath'] },
    fallback: 'all',
  },
  {
    clientId: 'grace',
    assignments: [
      {
        key: 'delay',
        type: 'reflection',
        title: 'The Delay',
        instructions: 'Notice the urge, then wait. Write down how long the wait lasted.',
        targetTime: '07:00',
        partOfDay: 'morning',
        durationMin: 8,
        usualDelayMin: 6,
      },
      {
        key: 'breathe',
        type: 'breathing',
        title: 'Four Rounds',
        instructions: 'A short breath practice, used at the point the delay becomes difficult.',
        targetTime: '09:30',
        partOfDay: 'morning',
        durationMin: 5,
        resourceId: 'res-478',
        usualDelayMin: 12,
      },
      {
        key: 'review',
        type: 'journal',
        title: 'Evening Review',
        instructions: 'Which delay held today, and which one did not?',
        targetTime: '20:00',
        partOfDay: 'evening',
        durationMin: 7,
        usualDelayMin: 15,
      },
    ],
    completed: { 0: ['delay', 'breathe'], '-6': ['delay', 'review'], '-7': ['delay', 'review'] },
    fallback: 'all',
  },
  {
    clientId: 'lucas',
    assignments: [
      {
        key: 'pause',
        type: 'breathing',
        title: 'The Pause Before Answering',
        instructions: 'One full breath before responding in any difficult exchange.',
        targetTime: '12:00',
        partOfDay: 'midday',
        durationMin: 4,
        days: WEEKDAYS,
        usualDelayMin: 120,
      },
      {
        key: 'evening',
        type: 'reflection',
        title: 'Evening Reflection',
        instructions: 'Where did the pause hold today, and where did it not?',
        targetTime: '21:00',
        partOfDay: 'evening',
        durationMin: 8,
        usualDelayMin: 40,
      },
    ],
    completed: { 0: [], '-1': ['evening'], '-3': ['evening'], '-5': [] },
    fallback: 'all',
  },
];

export const planFor = (clientId: string) => plans.find((p) => p.clientId === clientId);

/** The stored assignment records, derived from the plans above. */
export const assignments: Assignment[] = plans.flatMap((plan) =>
  plan.assignments.map((seed) => ({
    id: `as-${plan.clientId}-${seed.key}`,
    clientId: plan.clientId,
    type: seed.type,
    title: seed.title,
    instructions: seed.instructions,
    frequency: seed.days ? ('specific-days' as const) : ('daily' as const),
    days: seed.days,
    targetTime: seed.targetTime,
    partOfDay: seed.partOfDay,
    durationMin: seed.durationMin,
    reminder: seed.partOfDay === 'morning' ? ('at-time' as const) : ('15-min-before' as const),
    resourceId: seed.resourceId,
    optional: seed.optional,
    assignedAt: '2026-08-10T09:00:00',
    assignedBy: 'john',
    active: true,
  })),
);
