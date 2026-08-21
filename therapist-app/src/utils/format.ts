import type { PracticeType, ResourceType, SessionType, NoteType } from '@/types';

export const practiceTypeLabel: Record<PracticeType, string> = {
  breathing: 'Breathing',
  meditation: 'Meditation',
  reflection: 'Reflection',
  journal: 'Journal',
  reading: 'Reading',
  audio: 'Audio',
  video: 'Video',
  questionnaire: 'Questionnaire',
  grounding: 'Grounding',
  'session-prep': 'Session preparation',
  'follow-up': 'Post-session follow-up',
};

export const resourceTypeLabel: Record<ResourceType, string> = {
  audio: 'Audio',
  worksheet: 'Worksheet',
  reading: 'Reading',
  video: 'Video',
  questionnaire: 'Questionnaire',
};

export const sessionTypeLabel: Record<SessionType, string> = {
  video: 'Video session',
  'in-person': 'In person',
  phone: 'Phone',
};

export const noteTypeLabel: Record<NoteType, string> = {
  session: 'Session note',
  observation: 'Observation',
  'follow-up': 'Follow-up',
  reminder: 'Reminder',
  progress: 'Progress note',
};

export function pct(value: number): string {
  return `${Math.round(value)}%`;
}

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** Small numbers read better as words in the calmer parts of the product. */
export function numberWord(count: number): string {
  return WORDS[count] ?? String(count);
}

/** "once", "twice", "3 times" */
export function times(count: number): string {
  if (count === 1) return 'once';
  if (count === 2) return 'twice';
  return `${count} times`;
}

export function plural(
  count: number,
  singular: string,
  pluralForm = `${singular}s`,
  asWord = false,
): string {
  const n = asWord ? numberWord(count) : count;
  return `${n} ${count === 1 ? singular : pluralForm}`;
}

export function initialsOf(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();
}

/** Turns a list into "a, b and c" for calm prose in briefs and summaries. */
export function sentenceList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
