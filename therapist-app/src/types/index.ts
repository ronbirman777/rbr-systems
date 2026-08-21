/**
 * Domain model for the RBR Therapist Companion ecosystem.
 *
 * These types intentionally describe *records* rather than screen props, so the
 * same shapes can later be served by a real backend (see `services/api.ts`)
 * without touching the components that render them.
 */

export type ID = string;
/** ISO-8601 instant, e.g. `2026-08-21T09:02:00.000Z`. */
export type ISODateTime = string;
/** Calendar day in `YYYY-MM-DD`. */
export type ISODate = string;

/* ------------------------------------------------------------------ people */

export interface Person {
  id: ID;
  firstName: string;
  lastName: string;
  /** Central photo reference — never inline a portrait URL in a component. */
  photoUrl: string;
  initials: string;
}

export interface Therapist extends Person {
  role: 'therapist';
  title: string;
  practiceName: string;
}

export type ClientStatus =
  | 'on-track'
  | 'change-detected'
  | 'check-in-suggested'
  | 'recently-inactive'
  | 're-engaged'
  | 'new-client';

export interface Client extends Person {
  role: 'client';
  /** Therapeutic focus label used for the demo — not a clinical diagnosis. */
  focus: string;
  focusDetail: string;
  weeksTogether: number;
  startedOn: ISODate;
  /** Client's own baseline: completion rate across prior weeks, 0–100. */
  usualRhythm: number;
  lastActiveAt: ISODateTime;
  /** Median hours between a message from John and this client's reply. */
  typicalReplyHours: number;
  /** Plain-language observation written by the system, never interpretive. */
  recentObservation: string;
  preferredName: string;
  /** A short, human phrase shown at the top of the client's day. */
  todaysFocus: string;
  /** A closing line in the client app — supportive, never instructional. */
  closingReflection: string;
  timezone: string;
  /** Days since the client's last practice completion at demo start. */
  quietDays: number;
  /** Set when the client re-engaged after a quiet stretch. */
  reEngagedOn?: ISODate;
  accent: 'sage' | 'amber' | 'rose' | 'forest';
}

/* --------------------------------------------------------------- practices */

export type PracticeType =
  | 'breathing'
  | 'meditation'
  | 'reflection'
  | 'journal'
  | 'reading'
  | 'audio'
  | 'video'
  | 'questionnaire'
  | 'grounding'
  | 'session-prep'
  | 'follow-up';

export type PartOfDay = 'morning' | 'midday' | 'evening';
export type RepeatRule = 'once' | 'daily' | 'weekdays' | 'weekly';
export type ReminderRule = 'none' | 'at-time' | '15-min-before' | 'morning-of';

/** What the *client* chooses to share back with the therapist. */
export type ReflectionVisibility = 'private' | 'shared';

/**
 * A single scheduled instance of a practice. Repeating assignments are
 * expanded into one record per day so completion is always unambiguous.
 */
export interface Practice {
  id: ID;
  clientId: ID;
  assignmentId: ID;
  type: PracticeType;
  title: string;
  instructions: string;
  date: ISODate;
  /** 24h local time, `HH:MM`. */
  time: string;
  partOfDay: PartOfDay;
  durationMin: number;
  repeat: RepeatRule;
  reminder: ReminderRule;
  resourceId?: ID;
  /** Optional note from John shown with the practice in the client app. */
  message?: string;
  /** Whether a written reflection is invited for this practice. */
  invitesReflection: boolean;
  assignedAt: ISODateTime;
  assignedBy: ID;
  completion?: PracticeCompletion;
}

/**
 * Completion is *owned by the client app*. The therapist app never writes this
 * record through ordinary UI — see `docs` in README, "Completion ownership".
 */
export interface PracticeCompletion {
  completedAt: ISODateTime;
  /** Recorded so the UI can always show who marked it complete. */
  source: 'client';
  reflection?: {
    text: string;
    visibility: ReflectionVisibility;
  };
}

export type PracticeState = 'completed' | 'due' | 'upcoming' | 'missed';

/* ---------------------------------------------------------------- sessions */

export type SessionType = 'video' | 'in-person' | 'phone';

export interface PrepPrompt {
  id: ID;
  text: string;
  answeredAt?: ISODateTime;
  answer?: string;
}

export interface Session {
  id: ID;
  clientId: ID;
  startsAt: ISODateTime;
  durationMin: number;
  type: SessionType;
  prepPrompts: PrepPrompt[];
  /** Therapist-only summary written after the session. */
  notes?: string;
  status: 'upcoming' | 'completed' | 'cancelled';
  focus?: string;
}

/* ---------------------------------------------------------------- messages */

export type MessageAuthor = 'therapist' | 'client';

export interface Message {
  id: ID;
  threadId: ID;
  author: MessageAuthor;
  body: string;
  sentAt: ISODateTime;
  readByTherapist: boolean;
  readByClient: boolean;
  /** Marks messages that started life as a suggested supportive check-in. */
  kind: 'message' | 'check-in';
}

export interface Thread {
  id: ID;
  clientId: ID;
  messages: Message[];
  draft?: string;
}

/* --------------------------------------------------------------- resources */

export type ResourceType = 'audio' | 'worksheet' | 'reading' | 'video' | 'questionnaire';

export interface Resource {
  id: ID;
  title: string;
  type: ResourceType;
  category: string;
  durationMin: number;
  summary: string;
  /** Short preview body shown in the resource drawer. */
  preview: string[];
  clientsUsing: ID[];
  addedOn: ISODate;
}

/* ------------------------------------------------------------------ notes */

export type NoteType = 'session' | 'observation' | 'follow-up' | 'reminder' | 'progress';

/** Therapist-only. Never rendered anywhere inside the client experience. */
export interface PrivateNote {
  id: ID;
  clientId: ID;
  type: NoteType;
  body: string;
  createdAt: ISODateTime;
  authorId: ID;
}

/* ------------------------------------------------------------------ journey */

export interface JourneyChapter {
  id: ID;
  clientId: ID;
  title: string;
  subtitle: string;
  weekFrom: number;
  weekTo?: number;
  summary: string;
  practicesIntroduced: string[];
  milestones: { id: ID; label: string; on: ISODate }[];
  current: boolean;
}

/* ------------------------------------------------------------------- events */

export type ActivityKind =
  | 'practice-completed'
  | 'reflection-shared'
  | 'message-sent'
  | 'message-received'
  | 'check-in-sent'
  | 'practice-assigned'
  | 'resource-opened'
  | 'session-prep'
  | 'session-completed'
  | 'rhythm-change';

/** Append-only stream that powers Recent Activity and the session brief. */
export interface ActivityEvent {
  id: ID;
  clientId: ID;
  kind: ActivityKind;
  label: string;
  detail?: string;
  at: ISODateTime;
  /** Only high-signal relationship events surface prominently. */
  prominence: 'ambient' | 'notable';
  meta?: Record<string, string | number | boolean>;
}
