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

export type SessionMode = 'video' | 'in-person' | 'phone' | 'custom';
export type SessionStatus = 'scheduled' | 'completed' | 'cancelled';
/** How the appointment came to exist. */
export type BookingSource = 'practitioner' | 'client-request' | 'client-instant' | 'recurring';
/** Preparation states as drawn on the Today rail. */
export type SessionPrepState = 'prep-ready' | 'notes-to-review' | 'reflection-available' | 'not-started';

export interface PreSessionAnswer {
  question: string;
  answer: string;
}

export interface Session {
  id: ID;
  clientId: ID;
  practitionerId: ID;
  startsAt: ISODateTime;
  /** Stored rather than derived so a future backend can index on it. */
  endsAt: ISODateTime;
  durationMin: number;
  mode: SessionMode;
  /** Room, address or a note about where — free text, optional. */
  location?: string;
  videoUrl?: string;
  focus: string;
  status: SessionStatus;
  prepState: SessionPrepState;
  /** Set when this session belongs to a recurring series. */
  seriesId?: ID;
  createdBy: 'practitioner' | 'client';
  bookingSource: BookingSource;
  /** A short note the client sees with the appointment. */
  noteForClient?: string;
  /** Answers to the pre-session reflection, written by the client. */
  preSession?: PreSessionAnswer[];
  /** Agreed next steps from the previous session. */
  actionItems?: { id: ID; text: string; done: boolean }[];
  /** Practitioner-only. Never rendered anywhere in the client experience. */
  privateNotes?: string;
  cancelledReason?: string;
  cancelledBy?: 'practitioner' | 'client';
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/* ------------------------------------------------------------ recurrence */

export type RecurrenceRule = 'none' | 'weekly' | 'biweekly' | 'monthly';

/**
 * A standing appointment. Concrete `Session` records are expanded from this so
 * conflict detection and the calendar only ever reason about real appointments,
 * while the series stays editable as a whole.
 */
export interface SessionSeries {
  id: ID;
  clientId: ID;
  rule: Exclude<RecurrenceRule, 'none'>;
  /** 0 = Sunday. */
  dayOfWeek: number;
  /** 24h local `HH:MM`. */
  startTime: string;
  durationMin: number;
  mode: SessionMode;
  focus: string;
  startsOn: ISODate;
  endsOn?: ISODate;
  /**
   * When true the slot is held for this client even on weeks with no expanded
   * session yet — "reserve this time for Emma".
   */
  reservesSlot: boolean;
  createdAt: ISODateTime;
}

/* ---------------------------------------------------------- availability */

/** A weekly window in which clients may book. Never an appointment itself. */
export interface AvailabilityRule {
  id: ID;
  practitionerId: ID;
  /** 0 = Sunday. */
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  /** IANA zone. Display currently uses the practice zone throughout. */
  timezone: string;
  effectiveFrom: ISODate;
  effectiveUntil?: ISODate;
}

export type ExceptionReason =
  | 'vacation'
  | 'personal'
  | 'conference'
  | 'lunch'
  | 'private-appointment'
  | 'unavailable';

/** A date-specific block that removes time from availability. */
export interface AvailabilityException {
  id: ID;
  practitionerId: ID;
  date: ISODate;
  allDay: boolean;
  /** Ignored when `allDay`. */
  startTime?: string;
  endTime?: string;
  reason: ExceptionReason;
  note?: string;
}

/* ------------------------------------------------------- booking requests */

export type BookingMode = 'instant' | 'request';
export type BookingRequestStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'superseded';

export interface BookingRequest {
  id: ID;
  clientId: ID;
  startsAt: ISODateTime;
  durationMin: number;
  mode: SessionMode;
  status: BookingRequestStatus;
  /** Optional line from the client with the request. */
  note?: string;
  createdAt: ISODateTime;
  respondedAt?: ISODateTime;
  /** Set when the practitioner proposes a different time. */
  suggestedAt?: ISODateTime;
  suggestionNote?: string;
  /** The session created when the request was accepted. */
  sessionId?: ID;
}

/* ------------------------------------------------- session preparation */

export type PreparationKind =
  | 'reflection'
  | 'questionnaire'
  | 'journal'
  | 'breathing'
  | 'worksheet';

/**
 * Something the client is asked to do before a session. Attached by the
 * practitioner, completed by the client — the completion is what the
 * practitioner sees, and the written response only when the client submits it.
 */
export interface SessionPreparation {
  id: ID;
  sessionId: ID;
  clientId: ID;
  kind: PreparationKind;
  title: string;
  prompt: string;
  resourceId?: ID;
  assignedAt: ISODateTime;
  completedAt?: ISODateTime;
  response?: string;
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

export type ResourceCategoryId =
  | 'breathing'
  | 'meditation'
  | 'grounding'
  | 'reflection'
  | 'sleep'
  | 'anxiety'
  | 'self-compassion'
  | 'relationships'
  | 'session-preparation'
  | 'worksheets';

export type ResourceFormat =
  | 'audio'
  | 'video'
  | 'pdf'
  | 'worksheet'
  | 'reflection'
  | 'prompt'
  | 'breathing'
  | 'meditation'
  | 'questionnaire'
  | 'link'
  | 'document';

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
  /** Guidance shown to the client above the body. */
  instructions?: string;
  /** For `link`, `pdf` and `video` resources. */
  url?: string;
  tags: string[];
  /** Breathwork resources render a paced breathing animation. */
  breathPattern?: { inhale: number; hold: number; exhale: number };
  /** Archived resources leave the library but are never destroyed. */
  status: 'active' | 'archived';
  createdBy: 'practitioner' | 'library';
  addedOn: ISODate;
  updatedAt?: ISODateTime;
}

/**
 * One resource given to one client. Held as a record rather than a list on the
 * resource, so the when, the why and the covering note survive.
 */
export interface ResourceAssignment {
  id: ID;
  resourceId: ID;
  clientId: ID;
  assignedAt: ISODateTime;
  assignedBy: ID;
  /** A line from the practitioner shown with the resource. */
  message?: string;
  startDate?: ISODate;
  dueDate?: ISODate;
  suggestedTime?: string;
  repeat: RecurrenceRule;
  openedAt?: ISODateTime;
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

/* --------------------------------------------------------------- messages */

export type MessageAuthor = 'practitioner' | 'client';
/**
 * A check-in is an ordinary message that the system helped draft. It is still
 * written and sent by a person — the kind only records where it came from.
 */
export type MessageKind = 'message' | 'check-in' | 'system';

export interface Message {
  id: ID;
  clientId: ID;
  author: MessageAuthor;
  body: string;
  kind: MessageKind;
  /** Drafts are visible only to their author and are never delivered. */
  status: 'draft' | 'sent';
  createdAt: ISODateTime;
  sentAt?: ISODateTime;
  readByPractitioner: boolean;
  readByClient: boolean;
}

/* ---------------------------------------------------------- notifications */

export type NotificationKind =
  | 'booking-request'
  | 'booking-accepted'
  | 'booking-declined'
  | 'session-rescheduled'
  | 'session-cancelled'
  | 'session-reminder'
  | 'message'
  | 'rhythm-change'
  | 'reflection-shared'
  | 'preparation-completed'
  | 'practice-assigned'
  | 'resource-assigned';

/**
 * Something worth surfacing once. Practice completions deliberately do not
 * produce notifications — they belong in Recent Activity.
 */
export interface AppNotification {
  id: ID;
  audience: MessageAuthor;
  clientId: ID;
  kind: NotificationKind;
  title: string;
  body?: string;
  at: ISODateTime;
  read: boolean;
  /** In-app destination for the notification. */
  href?: string;
}

/* ----------------------------------------------------------------- events */

export type ActivityKind =
  | 'practice-completed'
  | 'reflection-submitted'
  | 'check-in-sent'
  | 'message-sent'
  | 'message-received'
  | 'practice-assigned'
  | 'resource-assigned'
  | 'resource-opened'
  | 'pre-session-completed'
  | 'preparation-completed'
  | 'session-completed'
  | 'session-booked'
  | 'session-rescheduled'
  | 'session-cancelled';

/** Append-only stream behind Continuous Care and recent activity. */
export interface ActivityEvent {
  id: ID;
  clientId: ID;
  kind: ActivityKind;
  label: string;
  detail?: string;
  at: ISODateTime;
}
