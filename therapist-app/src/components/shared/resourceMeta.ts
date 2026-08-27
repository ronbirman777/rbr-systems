import {
  BookOpen,
  Brain,
  ClipboardList,
  ExternalLink,
  FileText,
  Headphones,
  Heart,
  Leaf,
  ListChecks,
  Moon,
  NotebookPen,
  PlayCircle,
  Sparkles,
  Users,
  Wind,
} from 'lucide-react';
import type { ResourceCategoryId, ResourceFormat } from '@/types';

type Icon = typeof Headphones;

/** One place decides how a resource looks, so every surface agrees. */
export const formatIcon: Record<ResourceFormat, Icon> = {
  audio: Headphones,
  video: PlayCircle,
  pdf: FileText,
  worksheet: ClipboardList,
  reflection: NotebookPen,
  prompt: NotebookPen,
  breathing: Wind,
  meditation: Headphones,
  questionnaire: ListChecks,
  link: ExternalLink,
  document: BookOpen,
};

export const formatLabel: Record<ResourceFormat, string> = {
  audio: 'Audio',
  video: 'Video',
  pdf: 'PDF',
  worksheet: 'Worksheet',
  reflection: 'Reflection',
  prompt: 'Journal Prompt',
  breathing: 'Breathing Practice',
  meditation: 'Meditation',
  questionnaire: 'Questionnaire',
  link: 'External Link',
  document: 'Reading',
};

/** Formats offered when adding a resource, in the order they are shown. */
export const formatOptions: ResourceFormat[] = [
  'audio',
  'video',
  'pdf',
  'worksheet',
  'reflection',
  'prompt',
  'breathing',
  'meditation',
  'questionnaire',
  'link',
];

export const categoryIcon: Record<ResourceCategoryId, Icon> = {
  breathing: Wind,
  meditation: Headphones,
  grounding: Leaf,
  reflection: NotebookPen,
  sleep: Moon,
  anxiety: Brain,
  'self-compassion': Heart,
  relationships: Users,
  'session-preparation': Sparkles,
  worksheets: ClipboardList,
};

/** Formats that carry a player rather than a page. */
export const isPlayable = (format: ResourceFormat) =>
  format === 'audio' || format === 'meditation' || format === 'video';

/**
 * Formats that run on a clock and so need a transport. Breathing belongs here
 * even though there is no recording behind it — the pace is what is being
 * played, and without a control there is no way to start it.
 */
export const hasTransport = (format: ResourceFormat) =>
  isPlayable(format) || format === 'breathing';
