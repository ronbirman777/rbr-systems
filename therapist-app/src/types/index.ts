/**
 * Domain model for the RBR Client Journey Hub.
 *
 * These describe *records*, not screen props, so the same shapes can later be
 * served by Supabase/Postgres without touching the components that render them.
 * Anything the UI needs that is not stored is derived in `services/`.
 */

export type ID = string;
/** ISO-8601 instant, e.g. `2026-08-26T08:12:00`. */
export type ISODateTime = string;
/** Calendar day, `YYYY-MM-DD`. */
export type ISODate = string;

/* ------------------------------------------------------------------ people */

export interface Person {
  id: ID;
  /** The name shown throughout the product — the references use first names. */
  name: string;
  /** Held for a future real account; not surfaced in the demo UI. */
  familyName: string;
  /** Two letters, as drawn in the references: Emma → EM, Daniel → DA. */
  initials: string;
}

export interface Practitioner extends Person {
  role: 'practitioner';
  title: string;
}

/**
 * A client's rhythm state. These are the only states the product shows, and
 * they describe activity — never a person, and never a clinical condition.
 */
export type AttentionState =
  | 'on-track'
  | 'change-detected'
  | 'check-in-suggested'
  | 'recently-inactive'
  | 're-engaged'
  | 'baseline-forming';

export interface Client extends Person {
  role: 'client';
  /** A short focus label for the demo — not a diagnosis. */
  focus: string;
  focusDetail: string;
  startedOn: ISODate;
  weeksTogether: number;
  /**
   * The client's own baseline completion rate, learned over `baselineDays`.
   * Never compared with another client, and never shown to the client.
   */
  usualRhythm: number;
  baselineDays: number;
  lastActivityAt: ISODateTime;
  /** Plain-language line used where a one-sentence summary is needed. */
  summary: string;
  timezone: string;
}

/* --------------------------------------------------------------- practices */

export type PracticeType = 'breathing' | 'meditation' | 'journal' | 'reflection' | 'read' | 'listen';
export type PartOfDay = 'morning' | 'midday' | 'evening' | 'night';
export type Frequency = 'daily' | 'weekdays' | 'specific-days' | 'once';
export type ReminderRule = 'none' | 'at-time' | '15-min-before' | 'morning-of';

/** A standing assignment: what the practitioner asked for, and why. */
export interface Assignment {
  id: ID;
  clientId: ID;
  type: PracticeType;
  title: string;
  /** Instructions and personal context, written to the client. */
  instructions: string;
  frequency: Frequency;
  /** 0 = Sunday. Used when `frequency` is `specific-days` or `weekdays`. */
  days?: number[];
  /** 24h local `HH:MM`. */
  targetTime: string;
  partOfDay: PartOfDay;
  durationMin: number;
  reminder: ReminderRule;
  resourceId?: ID;
  /** Optional practices are offered, never expected. */
  optional?: boolean;
  assignedAt: ISODateTime;
  assignedBy: ID;
  active: boolean;
}

/** One dated instance of an assignment. Completion is unambiguous per day. */
export interface Practice {
  id: ID;
  assignmentId: ID;
  clientId: ID;
  date: ISODate;
  /** Denormalised from the assignment so a practice always renders alone. */
  type: PracticeType;
  title: string;
  instructions: string;
  targetTime: string;
  partOfDay: PartOfDay;
  durationMin: number;
  resourceId?: ID;
  optional?: boolean;
  completedAt?: ISODateTime;
}

export type PracticeState = 'completed' | 'available' | 'later' | 'not-completed' | 'optional';

/* --------------------------------------------------------------- sessions */

export type SessionMode = 'video' | 'in-person';
/** Preparation states as drawn on the Today rail. */
export type SessionPrepState = 'prep-ready' | 'notes-to-review' | 'reflection-available' | 'not-started';

export interface PreSessionAnswer {
  question: string;
  answer: string;
}

export interface Session {
  id: ID;
  clientId: ID;
  startsAt: ISODateTime;
  durationMin: number;
  mode: SessionMode;
  focus: string;
  status: 'upcoming' | 'completed';
  prepState: SessionPrepState;
  /** Answers to the pre-session reflection, written by the client. */
  preSession?: PreSessionAnswer[];
  /** Agreed next steps from the previous session. */
  actionItems?: { id: ID; text: string; done: boolean }[];
  /** Practitioner-only. Never rendered anywhere in the client experience. */
  privateNotes?: string;
}

/* ------------------------------------------------------------ reflections */

export interface Reflection {
  id: ID;
  clientId: ID;
  /** Where it came from — a journal practice, or a session preparation. */
  source: 'practice' | 'pre-session';
  title: string;
  body: string;
  submittedAt: ISODateTime;
  /** Practitioner-only thought attached to a reflection. */
  privateThought?: string;
  readByPractitioner: boolean;
}

/* -------------------------------------------------------------- resources */

export type ResourceCategoryId = 'meditations' | 'breathwork' | 'journal-prompts' | 'reading';
export type ResourceFormat = 'audio' | 'prompt' | 'document';

export interface ResourceCategory {
  id: ResourceCategoryId;
  title: string;
  blurb: string;
}

export interface Resource {
  id: ID;
  categoryId: ResourceCategoryId;
  title: string;
  format: ResourceFormat;
  durationMin: number;
  summary: string;
  /** The written body — steps for a practice, prompts for a journal entry. */
  body: string[];
  /** Breathwork resources render a paced breathing animation. */
  breathPattern?: { inhale: number; hold: number; exhale: number };
  assignedTo: ID[];
  addedOn: ISODate;
}

/* --------------------------------------------------------------- journey */

export interface JourneyChapter {
  id: ID;
  clientId: ID;
  index: number;
  title: string;
  weeks: string;
  state: 'completed' | 'in-progress' | 'upcoming';
  focus: string;
  milestones: string[];
}

/* -------------------------------------------------------------- check-ins */

/** A supportive message. Suggested by the system, always sent by a person. */
export interface CheckIn {
  id: ID;
  clientId: ID;
  body: string;
  status: 'draft' | 'sent';
  createdAt: ISODateTime;
  sentAt?: ISODateTime;
}

/* ----------------------------------------------------------------- events */

export type ActivityKind =
  | 'practice-completed'
  | 'reflection-submitted'
  | 'check-in-sent'
  | 'practice-assigned'
  | 'resource-opened'
  | 'pre-session-completed'
  | 'session-completed';

/** Append-only stream behind Continuous Care and recent activity. */
export interface ActivityEvent {
  id: ID;
  clientId: ID;
  kind: ActivityKind;
  label: string;
  detail?: string;
  at: ISODateTime;
}
