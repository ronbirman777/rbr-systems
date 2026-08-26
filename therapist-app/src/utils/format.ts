import type { PracticeType, ResourceFormat, SessionMode, SessionPrepState, AttentionState } from '@/types';

export const practiceTypeLabel: Record<PracticeType, string> = {
  breathing: 'Breathwork',
  meditation: 'Meditation',
  journal: 'Journal',
  reflection: 'Reflection',
  read: 'Read',
  listen: 'Listen',
};

export const resourceFormatLabel: Record<ResourceFormat, string> = {
  audio: 'Audio',
  prompt: 'Journal Prompt',
  document: 'Reading',
};

export const sessionModeLabel: Record<SessionMode, string> = {
  video: 'Video',
  'in-person': 'In Person',
};

export const prepStateLabel: Record<SessionPrepState, string> = {
  'prep-ready': 'Prep Ready',
  'notes-to-review': 'Notes to Review',
  'reflection-available': 'Reflection Available',
  'not-started': 'No Prep Yet',
};

/** The only vocabulary the product uses for a rhythm state. */
export const attentionLabel: Record<AttentionState, string> = {
  'on-track': 'On Track',
  'change-detected': 'Change Detected',
  'check-in-suggested': 'Check In Suggested',
  'recently-inactive': 'Recently Inactive',
  're-engaged': 'Re Engaged',
  'baseline-forming': 'Baseline Forming',
};

export const pct = (value: number) => `${Math.round(value)}%`;

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
export const numberWord = (count: number) => WORDS[count] ?? String(count);

/** Two-letter monogram from a single given name: Emma → EM. */
export const monogram = (name: string) => name.slice(0, 2).toUpperCase();
