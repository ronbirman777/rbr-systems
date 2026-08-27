import type {
  ActivityEvent,
  AppNotification,
  Assignment,
  AvailabilityException,
  AvailabilityRule,
  BookingMode,
  BookingRequest,
  Client,
  ExceptionReason,
  Frequency,
  ID,
  ISODate,
  ISODateTime,
  JourneyChapter,
  Message,
  NotificationKind,
  PartOfDay,
  Practice,
  PracticeType,
  Practitioner,
  PreparationKind,
  PreSessionAnswer,
  RecurrenceRule,
  Reflection,
  ReminderRule,
  Resource,
  ResourceAssignment,
  ResourceCategoryId,
  ResourceFormat,
  Session,
  SessionMode,
  SessionPreparation,
  SessionSeries,
} from '@/types';
import {
  assignments as seedAssignments,
  availabilityExceptions as seedExceptions,
  availabilityRules as seedRules,
  bookingRequests as seedRequests,
  buildEvents,
  clients as seedClients,
  journeyChapters as seedChapters,
  messages as seedMessages,
  practices as seedPractices,
  practitioner as seedPractitioner,
  reflections as seedReflections,
  resourceAssignments as seedResourceAssignments,
  resourceCategories as seedCategories,
  resources as seedResources,
  sessions as seedSessions,
  sessionSeries as seedSeries,
  type ResourceCategory,
} from '@/data';
import { findResource } from '@/data/resources';
import { seriesDates } from '@/services/scheduling';
import { DEMO_NOW, addDays, atTime, sessionWhen, toISODate } from '@/utils/date';

/**
 * One store holds the whole practice. Both experiences read and write it, which
 * is what makes the lifecycle visible: an appointment John creates appears in
 * Emma's companion, and a slot Emma books appears on John's calendar, with no
 * synchronisation code in between.
 *
 * The shape mirrors the rows a Postgres schema would return, so replacing this
 * reducer with real queries stays a service-layer change.
 */
export interface AppState {
  practitioner: Practitioner;
  clients: Client[];
  assignments: Assignment[];
  practices: Practice[];
  sessions: Session[];
  series: SessionSeries[];
  availability: AvailabilityRule[];
  exceptions: AvailabilityException[];
  bookingRequests: BookingRequest[];
  bookingMode: BookingMode;
  preparations: SessionPreparation[];
  reflections: Reflection[];
  resources: Resource[];
  resourceAssignments: ResourceAssignment[];
  resourceCategories: ResourceCategory[];
  chapters: JourneyChapter[];
  messages: Message[];
  notifications: AppNotification[];
  events: ActivityEvent[];
  mode: 'practitioner' | 'client';
  activeClientId: string;
}

/* ------------------------------------------------------------------ drafts */

export interface SessionDraft {
  clientId: string;
  date: ISODate;
  startTime: string;
  durationMin: number;
  mode: SessionMode;
  focus: string;
  location?: string;
  noteForClient?: string;
  privateNote?: string;
  repeat: RecurrenceRule;
  reservesSlot: boolean;
}

export interface AssignmentDraft {
  clientId: string;
  type: PracticeType;
  title: string;
  instructions: string;
  frequency: Frequency;
  days: number[];
  targetTime: string;
  reminder: ReminderRule;
  resourceId?: string;
}

export interface ResourceDraft {
  id?: string;
  title: string;
  summary: string;
  format: ResourceFormat;
  categoryId: ResourceCategoryId;
  durationMin: number;
  instructions?: string;
  url?: string;
  tags: string[];
  body: string[];
}

export interface ResourceAssignmentDraft {
  resourceId: string;
  clientIds: string[];
  message?: string;
  startDate?: ISODate;
  dueDate?: ISODate;
  suggestedTime?: string;
  repeat: RecurrenceRule;
}

/** How far a change to a recurring appointment reaches. */
export type SeriesScope = 'this' | 'future' | 'series';

export type Action =
  | { type: 'practice/complete'; practiceId: ID }
  | { type: 'assignment/create'; draft: AssignmentDraft }
  | { type: 'reflection/submit'; clientId: ID; title: string; body: string; practiceId?: ID }
  | { type: 'reflection/mark-read'; reflectionId: ID }
  | { type: 'reflection/private-thought'; reflectionId: ID; thought: string }
  /* scheduling */
  | { type: 'session/create'; draft: SessionDraft; source?: Session['bookingSource'] }
  | { type: 'session/reschedule'; sessionId: ID; startsAt: ISODateTime; by: 'practitioner' | 'client' }
  | { type: 'session/cancel'; sessionId: ID; scope: SeriesScope; reason?: string; by: 'practitioner' | 'client' }
  | { type: 'session/complete'; sessionId: ID }
  | { type: 'session/private-notes'; sessionId: ID; notes: string }
  | { type: 'session/toggle-action'; sessionId: ID; actionId: ID }
  | { type: 'session/pre-session'; sessionId: ID; answers: PreSessionAnswer[] }
  | { type: 'series/update'; seriesId: ID; changes: Partial<SessionSeries> }
  /* availability */
  | { type: 'availability/replace'; rules: Omit<AvailabilityRule, 'id' | 'practitionerId' | 'timezone' | 'effectiveFrom'>[] }
  | { type: 'availability/block'; date: ISODate; allDay: boolean; startTime?: string; endTime?: string; reason: ExceptionReason; note?: string }
  | { type: 'availability/unblock'; exceptionId: ID }
  | { type: 'booking/mode'; mode: BookingMode }
  /* booking */
  | { type: 'booking/request'; clientId: ID; startsAt: ISODateTime; durationMin: number; mode: SessionMode; note?: string }
  | { type: 'booking/accept'; requestId: ID }
  | { type: 'booking/decline'; requestId: ID; note?: string }
  | { type: 'booking/suggest'; requestId: ID; startsAt: ISODateTime; note?: string }
  /* preparation */
  | { type: 'preparation/attach'; sessionId: ID; kind: PreparationKind; title: string; prompt: string; resourceId?: ID }
  | { type: 'preparation/complete'; preparationId: ID; response?: string }
  | { type: 'preparation/remove'; preparationId: ID }
  /* sanctuary */
  | { type: 'resource/save'; draft: ResourceDraft }
  | { type: 'resource/archive'; resourceId: ID }
  | { type: 'resource/restore'; resourceId: ID }
  | { type: 'resource/duplicate'; resourceId: ID }
  | { type: 'resource/assign'; draft: ResourceAssignmentDraft }
  | { type: 'resource/open'; clientId: ID; resourceId: ID }
  /* messages and notifications */
  | { type: 'message/send'; clientId: ID; body: string; author: 'practitioner' | 'client'; kind?: Message['kind'] }
  | { type: 'message/save-draft'; clientId: ID; body: string }
  | { type: 'message/mark-read'; clientId: ID; reader: 'practitioner' | 'client' }
  | { type: 'notification/read'; notificationId: ID }
  | { type: 'notification/read-all'; audience: 'practitioner' | 'client' }
  /* demo */
  | { type: 'mode/set'; mode: 'practitioner' | 'client'; clientId?: ID }
  | { type: 'demo/reset' };

let counter = 0;
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter += 1)}`;
const nowISO = () => DEMO_NOW.toISOString();

/** How far ahead recurring appointments are expanded into real sessions. */
const SERIES_HORIZON_DAYS = 84;

function expandSeries(series: SessionSeries, existing: Session[], from = addDays(DEMO_NOW, -14)): Session[] {
  const mine = existing.filter((s) => s.seriesId === series.id);
  const taken = new Set(mine.map((s) => s.startsAt));
  const ids = new Set(mine.map((s) => s.id));
  return seriesDates(series, from, SERIES_HORIZON_DAYS)
    .map((date) => {
      const start = atTime(date, series.startTime);
      return {
        id: `se-${series.id}-${date}`,
        clientId: series.clientId,
        practitionerId: 'john',
        startsAt: start.toISOString(),
        endsAt: new Date(start.getTime() + series.durationMin * 60_000).toISOString(),
        durationMin: series.durationMin,
        mode: series.mode,
        focus: series.focus,
        status: (start < DEMO_NOW ? 'completed' : 'scheduled') as Session['status'],
        prepState: 'not-started' as const,
        seriesId: series.id,
        createdBy: 'practitioner' as const,
        bookingSource: 'recurring' as const,
        createdAt: series.createdAt,
        updatedAt: series.createdAt,
      };
    })
    .filter((session) => !taken.has(session.startsAt) && !ids.has(session.id));
}

export function createInitialState(): AppState {
  const practices = seedPractices.map((p) => ({ ...p }));
  const baseSessions = seedSessions.map((s) => ({ ...s, actionItems: s.actionItems?.map((a) => ({ ...a })) }));
  const series = seedSeries.map((s) => ({ ...s }));
  const sessions = series.reduce<Session[]>(
    (acc, item) => [...acc, ...expandSeries(item, acc)],
    baseSessions,
  );
  const reflections = seedReflections.map((r) => ({ ...r }));
  const messages = seedMessages.map((m) => ({ ...m }));
  const resourceAssignments = seedResourceAssignments.map((a) => ({ ...a }));

  const preparations: SessionPreparation[] = [
    {
      id: 'sp-emma-0828',
      sessionId: 'se-emma-0828',
      clientId: 'emma',
      kind: 'reflection',
      title: 'Before we meet',
      prompt: 'What has taken up the most space since we last spoke?',
      assignedAt: '2026-08-21T11:40:00',
    },
  ];

  const notifications: AppNotification[] = [
    {
      id: 'nt-booking-noah',
      audience: 'practitioner',
      clientId: 'noah',
      kind: 'booking-request',
      title: 'Noah requested a session',
      body: 'Wednesday, September 2 at 11:00 AM',
      at: '2026-08-26T08:20:00',
      read: false,
      href: '/practitioner/sessions',
    },
    {
      id: 'nt-msg-maya',
      audience: 'practitioner',
      clientId: 'maya',
      kind: 'message',
      title: 'Maya replied',
      body: 'This week got away from me completely.',
      at: '2026-08-25T22:14:00',
      read: false,
      href: '/practitioner/clients/maya/messages',
    },
    {
      id: 'nt-reminder-emma',
      audience: 'client',
      clientId: 'emma',
      kind: 'session-reminder',
      title: 'Your session with John is on Friday at 10:30 AM',
      body: 'Preparation: 0 of 1 completed',
      at: '2026-08-26T08:00:00',
      read: false,
      href: '/client/emma/sessions',
    },
  ];

  return {
    practitioner: seedPractitioner,
    clients: seedClients.map((c) => ({ ...c })),
    assignments: seedAssignments.map((a) => ({ ...a })),
    practices,
    sessions,
    series,
    availability: seedRules.map((r) => ({ ...r })),
    exceptions: seedExceptions.map((e) => ({ ...e })),
    bookingRequests: seedRequests.map((r) => ({ ...r })),
    bookingMode: 'request',
    preparations,
    reflections,
    resources: seedResources.map((r) => ({ ...r })),
    resourceAssignments,
    resourceCategories: seedCategories,
    chapters: seedChapters,
    messages,
    notifications,
    events: buildEvents(practices, reflections, messages, sessions, resourceAssignments),
    mode: 'practitioner',
    activeClientId: 'emma',
  };
}

/* ------------------------------------------------------------------ helpers */

const withEvent = (state: AppState, event: Omit<ActivityEvent, 'id'>): ActivityEvent[] =>
  [{ ...event, id: uid('ev') }, ...state.events].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );

const notify = (
  state: AppState,
  notification: {
    audience: 'practitioner' | 'client';
    clientId: string;
    kind: NotificationKind;
    title: string;
    body?: string;
    href?: string;
  },
): AppNotification[] => [
  { ...notification, id: uid('nt'), at: nowISO(), read: false },
  ...state.notifications,
];

const touchClient = (state: AppState, clientId: string, at: string): Client[] =>
  state.clients.map((c) => (c.id === clientId ? { ...c, lastActivityAt: at } : c));

const partOfDayFor = (time: string): PartOfDay => {
  const hour = Number(time.slice(0, 2));
  if (hour < 11) return 'morning';
  if (hour < 16) return 'midday';
  if (hour < 21) return 'evening';
  return 'night';
};

function scheduleDates(draft: AssignmentDraft): ISODate[] {
  const out: ISODate[] = [];
  if (draft.frequency === 'once') return [toISODate(DEMO_NOW)];
  for (let i = 0; i < 21 && out.length < 14; i += 1) {
    const day = addDays(DEMO_NOW, i);
    if (draft.frequency === 'weekdays' && (day.getDay() === 0 || day.getDay() === 6)) continue;
    if (draft.frequency === 'specific-days' && !draft.days.includes(day.getDay())) continue;
    out.push(toISODate(day));
  }
  return out;
}

const buildSession = (
  draft: SessionDraft,
  source: Session['bookingSource'],
  seriesId?: string,
): Session => {
  const start = atTime(draft.date, draft.startTime);
  return {
    id: uid('se'),
    clientId: draft.clientId,
    practitionerId: 'john',
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + draft.durationMin * 60_000).toISOString(),
    durationMin: draft.durationMin,
    mode: draft.mode,
    location: draft.location,
    videoUrl: draft.mode === 'video' ? 'https://meet.example.com/rbr/session' : undefined,
    focus: draft.focus,
    status: 'scheduled',
    prepState: 'not-started',
    seriesId,
    createdBy: source === 'practitioner' || source === 'recurring' ? 'practitioner' : 'client',
    bookingSource: source,
    noteForClient: draft.noteForClient,
    privateNotes: draft.privateNote,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
};

const nameOf = (state: AppState, clientId: string) =>
  state.clients.find((c) => c.id === clientId)?.name ?? 'the client';

/* ------------------------------------------------------------------ reducer */

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    /**
     * Completion is written by the client companion. The practitioner
     * workspace has no action that produces it.
     */
    case 'practice/complete': {
      const practice = state.practices.find((p) => p.id === action.practiceId);
      if (!practice || practice.completedAt) return state;
      const at = nowISO();
      return {
        ...state,
        practices: state.practices.map((p) => (p.id === practice.id ? { ...p, completedAt: at } : p)),
        clients: touchClient(state, practice.clientId, at),
        events: withEvent(state, {
          clientId: practice.clientId,
          kind: 'practice-completed',
          label: `Completed ${practice.title}`,
          detail: findResource(practice.resourceId)?.title,
          at,
        }),
      };
    }

    case 'assignment/create': {
      const { draft } = action;
      const assignment: Assignment = {
        id: uid('as'),
        clientId: draft.clientId,
        type: draft.type,
        title: draft.title.trim(),
        instructions: draft.instructions.trim(),
        frequency: draft.frequency,
        days: draft.days,
        targetTime: draft.targetTime,
        partOfDay: partOfDayFor(draft.targetTime),
        durationMin: findResource(draft.resourceId)?.durationMin ?? 5,
        reminder: draft.reminder,
        resourceId: draft.resourceId,
        assignedAt: nowISO(),
        assignedBy: 'john',
        active: true,
      };
      const created: Practice[] = scheduleDates(draft).map((date) => ({
        id: uid(`pr-${draft.clientId}`),
        assignmentId: assignment.id,
        clientId: draft.clientId,
        date,
        type: assignment.type,
        title: assignment.title,
        instructions: assignment.instructions,
        targetTime: assignment.targetTime,
        partOfDay: assignment.partOfDay,
        durationMin: assignment.durationMin,
        resourceId: assignment.resourceId,
      }));
      return {
        ...state,
        assignments: [...state.assignments, assignment],
        practices: [...state.practices, ...created],
        notifications: notify(state, {
          audience: 'client',
          clientId: draft.clientId,
          kind: 'practice-assigned',
          title: `${state.practitioner.name} assigned ${assignment.title}`,
          href: `/client/${draft.clientId}/today`,
        }),
        events: withEvent(state, {
          clientId: draft.clientId,
          kind: 'practice-assigned',
          label: `You assigned ${assignment.title}`,
          detail: `${created.length} ${created.length === 1 ? 'day' : 'days'} from today`,
          at: nowISO(),
        }),
      };
    }

    case 'reflection/submit': {
      const at = nowISO();
      const reflection: Reflection = {
        id: uid('rf'),
        clientId: action.clientId,
        source: 'practice',
        title: action.title,
        body: action.body,
        submittedAt: at,
        readByPractitioner: false,
      };
      return {
        ...state,
        reflections: [reflection, ...state.reflections],
        practices: action.practiceId
          ? state.practices.map((p) => (p.id === action.practiceId ? { ...p, completedAt: at } : p))
          : state.practices,
        clients: touchClient(state, action.clientId, at),
        notifications: notify(state, {
          audience: 'practitioner',
          clientId: action.clientId,
          kind: 'reflection-shared',
          title: `${nameOf(state, action.clientId)} shared a reflection`,
          body: action.body.slice(0, 80),
          href: `/practitioner/clients/${action.clientId}/reflections`,
        }),
        events: withEvent(state, {
          clientId: action.clientId,
          kind: 'reflection-submitted',
          label: 'Submitted a reflection',
          detail: action.body.slice(0, 92),
          at,
        }),
      };
    }

    case 'reflection/mark-read':
      return {
        ...state,
        reflections: state.reflections.map((r) =>
          r.id === action.reflectionId ? { ...r, readByPractitioner: true } : r,
        ),
      };

    case 'reflection/private-thought':
      return {
        ...state,
        reflections: state.reflections.map((r) =>
          r.id === action.reflectionId ? { ...r, privateThought: action.thought } : r,
        ),
      };

    /* ------------------------------------------------------------ sessions */

    case 'session/create': {
      const { draft } = action;
      const source = action.source ?? 'practitioner';

      if (draft.repeat === 'none') {
        const session = buildSession(draft, source);
        return {
          ...state,
          sessions: [...state.sessions, session],
          notifications: notify(state, {
            audience: 'client',
            clientId: draft.clientId,
            kind: 'booking-accepted',
            title: `Session booked for ${sessionWhen(session.startsAt)}`,
            href: `/client/${draft.clientId}/sessions`,
          }),
          events: withEvent(state, {
            clientId: draft.clientId,
            kind: 'session-booked',
            label: `Session scheduled for ${sessionWhen(session.startsAt)}`,
            at: nowISO(),
          }),
        };
      }

      const series: SessionSeries = {
        id: uid('sr'),
        clientId: draft.clientId,
        rule: draft.repeat,
        dayOfWeek: new Date(`${draft.date}T00:00:00`).getDay(),
        startTime: draft.startTime,
        durationMin: draft.durationMin,
        mode: draft.mode,
        focus: draft.focus,
        startsOn: draft.date,
        reservesSlot: draft.reservesSlot,
        createdAt: nowISO(),
      };
      const created = expandSeries(series, state.sessions);
      return {
        ...state,
        series: [...state.series, series],
        sessions: [...state.sessions, ...created],
        notifications: notify(state, {
          audience: 'client',
          clientId: draft.clientId,
          kind: 'booking-accepted',
          title: `A standing session was set up for you`,
          body: `${sessionWhen(created[0]?.startsAt ?? nowISO())}, repeating`,
          href: `/client/${draft.clientId}/sessions`,
        }),
        events: withEvent(state, {
          clientId: draft.clientId,
          kind: 'session-booked',
          label: 'Standing appointment created',
          detail: `${created.length} sessions scheduled`,
          at: nowISO(),
        }),
      };
    }

    case 'session/reschedule': {
      const session = state.sessions.find((s) => s.id === action.sessionId);
      if (!session) return state;
      const start = new Date(action.startsAt);
      const updated: Session = {
        ...session,
        startsAt: start.toISOString(),
        endsAt: new Date(start.getTime() + session.durationMin * 60_000).toISOString(),
        // A moved session leaves its series; the rest of the series is untouched.
        seriesId: undefined,
        updatedAt: nowISO(),
      };
      return {
        ...state,
        sessions: state.sessions.map((s) => (s.id === session.id ? updated : s)),
        notifications: notify(state, {
          audience: action.by === 'practitioner' ? 'client' : 'practitioner',
          clientId: session.clientId,
          kind: 'session-rescheduled',
          title:
            action.by === 'practitioner'
              ? `Your session moved to ${sessionWhen(updated.startsAt)}`
              : `${nameOf(state, session.clientId)} moved a session to ${sessionWhen(updated.startsAt)}`,
          href:
            action.by === 'practitioner'
              ? `/client/${session.clientId}/sessions`
              : `/practitioner/sessions/${session.id}`,
        }),
        events: withEvent(state, {
          clientId: session.clientId,
          kind: 'session-rescheduled',
          label: `Session moved to ${sessionWhen(updated.startsAt)}`,
          at: nowISO(),
        }),
      };
    }

    case 'session/cancel': {
      const session = state.sessions.find((s) => s.id === action.sessionId);
      if (!session) return state;
      const cancel = (target: Session): Session => ({
        ...target,
        status: 'cancelled',
        cancelledReason: action.reason,
        cancelledBy: action.by,
        updatedAt: nowISO(),
      });

      // History is kept: a cancelled appointment is marked, never deleted.
      const affected = state.sessions.filter((s) => {
        if (s.id === session.id) return true;
        if (action.scope === 'this' || !session.seriesId) return false;
        if (s.seriesId !== session.seriesId || s.status !== 'scheduled') return false;
        return action.scope === 'series' || s.startsAt > session.startsAt;
      });
      const ids = new Set(affected.map((s) => s.id));

      return {
        ...state,
        sessions: state.sessions.map((s) => (ids.has(s.id) ? cancel(s) : s)),
        series:
          action.scope === 'series' && session.seriesId
            ? state.series.filter((s) => s.id !== session.seriesId)
            : state.series,
        notifications: notify(state, {
          audience: action.by === 'practitioner' ? 'client' : 'practitioner',
          clientId: session.clientId,
          kind: 'session-cancelled',
          title:
            action.by === 'practitioner'
              ? `Your session on ${sessionWhen(session.startsAt)} was cancelled`
              : `${nameOf(state, session.clientId)} cancelled ${sessionWhen(session.startsAt)}`,
          body: action.reason,
          href:
            action.by === 'practitioner'
              ? `/client/${session.clientId}/sessions`
              : '/practitioner/sessions',
        }),
        events: withEvent(state, {
          clientId: session.clientId,
          kind: 'session-cancelled',
          label: `Session on ${sessionWhen(session.startsAt)} cancelled`,
          detail: ids.size > 1 ? `${ids.size} sessions affected` : undefined,
          at: nowISO(),
        }),
      };
    }

    case 'session/complete': {
      const session = state.sessions.find((s) => s.id === action.sessionId);
      if (!session) return state;
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === session.id ? { ...s, status: 'completed', updatedAt: nowISO() } : s,
        ),
        events: withEvent(state, {
          clientId: session.clientId,
          kind: 'session-completed',
          label: 'Session completed',
          detail: session.focus,
          at: nowISO(),
        }),
      };
    }

    case 'session/private-notes':
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === action.sessionId ? { ...s, privateNotes: action.notes, updatedAt: nowISO() } : s,
        ),
      };

    case 'session/toggle-action':
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === action.sessionId
            ? {
                ...s,
                actionItems: s.actionItems?.map((a) =>
                  a.id === action.actionId ? { ...a, done: !a.done } : a,
                ),
              }
            : s,
        ),
      };

    case 'session/pre-session': {
      const session = state.sessions.find((s) => s.id === action.sessionId);
      if (!session) return state;
      const at = nowISO();
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === action.sessionId
            ? { ...s, preSession: action.answers, prepState: 'reflection-available', updatedAt: at }
            : s,
        ),
        clients: touchClient(state, session.clientId, at),
        notifications: notify(state, {
          audience: 'practitioner',
          clientId: session.clientId,
          kind: 'preparation-completed',
          title: `${nameOf(state, session.clientId)} completed session preparation`,
          href: `/practitioner/sessions/${session.id}`,
        }),
        events: withEvent(state, {
          clientId: session.clientId,
          kind: 'pre-session-completed',
          label: 'Completed session preparation',
          detail: action.answers[0]?.answer.slice(0, 92),
          at,
        }),
      };
    }

    case 'series/update': {
      const existing = state.series.find((s) => s.id === action.seriesId);
      if (!existing) return state;
      const updated = { ...existing, ...action.changes };

      // Changing a standing appointment has to move the appointments themselves,
      // not just the rule behind them — otherwise the old hour stays blocked and
      // the new one is offered to nobody. History is never rewritten: anything
      // already held, completed or cancelled stays exactly as it is, and only
      // the occurrences still ahead are laid out again.
      const kept = state.sessions.filter(
        (s) =>
          s.seriesId !== action.seriesId ||
          s.status === 'cancelled' ||
          s.status === 'completed' ||
          new Date(s.startsAt) < DEMO_NOW,
      );

      return {
        ...state,
        series: state.series.map((s) => (s.id === action.seriesId ? updated : s)),
        sessions: [...kept, ...expandSeries(updated, kept, DEMO_NOW)],
      };
    }

    /* -------------------------------------------------------- availability */

    case 'availability/replace':
      return {
        ...state,
        availability: action.rules.map((rule, index) => ({
          ...rule,
          id: uid(`av-${index}`),
          practitionerId: 'john',
          timezone: state.availability[0]?.timezone ?? 'Europe/Lisbon',
          effectiveFrom: '2026-01-01',
        })),
      };

    case 'availability/block':
      return {
        ...state,
        exceptions: [
          ...state.exceptions,
          {
            id: uid('ex'),
            practitionerId: 'john',
            date: action.date,
            allDay: action.allDay,
            startTime: action.startTime,
            endTime: action.endTime,
            reason: action.reason,
            note: action.note,
          },
        ],
      };

    case 'availability/unblock':
      return { ...state, exceptions: state.exceptions.filter((e) => e.id !== action.exceptionId) };

    case 'booking/mode':
      return { ...state, bookingMode: action.mode };

    /* -------------------------------------------------------------- booking */

    case 'booking/request': {
      const at = nowISO();
      const request: BookingRequest = {
        id: uid('br'),
        clientId: action.clientId,
        startsAt: action.startsAt,
        durationMin: action.durationMin,
        mode: action.mode,
        status: state.bookingMode === 'instant' ? 'accepted' : 'pending',
        note: action.note,
        createdAt: at,
        respondedAt: state.bookingMode === 'instant' ? at : undefined,
      };

      // Instant booking confirms immediately; request mode waits on a person.
      if (state.bookingMode === 'instant') {
        const client = state.clients.find((c) => c.id === action.clientId);
        const session = buildSession(
          {
            clientId: action.clientId,
            date: toISODate(new Date(action.startsAt)),
            startTime: new Date(action.startsAt).toTimeString().slice(0, 5),
            durationMin: action.durationMin,
            mode: action.mode,
            focus: client?.focus ?? 'Session',
            repeat: 'none',
            reservesSlot: false,
          },
          'client-instant',
        );
        return {
          ...state,
          bookingRequests: [{ ...request, sessionId: session.id }, ...state.bookingRequests],
          sessions: [...state.sessions, session],
          clients: touchClient(state, action.clientId, at),
          notifications: notify(state, {
            audience: 'practitioner',
            clientId: action.clientId,
            kind: 'booking-accepted',
            title: `${nameOf(state, action.clientId)} booked ${sessionWhen(session.startsAt)}`,
            href: '/practitioner/sessions',
          }),
          events: withEvent(state, {
            clientId: action.clientId,
            kind: 'session-booked',
            label: `Booked ${sessionWhen(session.startsAt)}`,
            at,
          }),
        };
      }

      return {
        ...state,
        bookingRequests: [request, ...state.bookingRequests],
        clients: touchClient(state, action.clientId, at),
        notifications: notify(state, {
          audience: 'practitioner',
          clientId: action.clientId,
          kind: 'booking-request',
          title: `${nameOf(state, action.clientId)} requested a session`,
          body: sessionWhen(request.startsAt),
          href: '/practitioner/sessions',
        }),
        events: withEvent(state, {
          clientId: action.clientId,
          kind: 'session-booked',
          label: `Requested ${sessionWhen(request.startsAt)}`,
          at,
        }),
      };
    }

    case 'booking/accept': {
      const request = state.bookingRequests.find((r) => r.id === action.requestId);
      if (!request || request.status !== 'pending') return state;
      const client = state.clients.find((c) => c.id === request.clientId);
      const start = new Date(request.startsAt);
      const session = buildSession(
        {
          clientId: request.clientId,
          date: toISODate(start),
          startTime: start.toTimeString().slice(0, 5),
          durationMin: request.durationMin,
          mode: request.mode,
          focus: client?.focus ?? 'Session',
          repeat: 'none',
          reservesSlot: false,
        },
        'client-request',
      );
      return {
        ...state,
        bookingRequests: state.bookingRequests.map((r) =>
          r.id === request.id
            ? { ...r, status: 'accepted', respondedAt: nowISO(), sessionId: session.id }
            : r,
        ),
        sessions: [...state.sessions, session],
        notifications: notify(state, {
          audience: 'client',
          clientId: request.clientId,
          kind: 'booking-accepted',
          title: `Your session is confirmed for ${sessionWhen(session.startsAt)}`,
          href: `/client/${request.clientId}/sessions`,
        }),
        events: withEvent(state, {
          clientId: request.clientId,
          kind: 'session-booked',
          label: `Booking confirmed for ${sessionWhen(session.startsAt)}`,
          at: nowISO(),
        }),
      };
    }

    case 'booking/decline':
      return {
        ...state,
        bookingRequests: state.bookingRequests.map((r) =>
          r.id === action.requestId
            ? { ...r, status: 'declined', respondedAt: nowISO(), suggestionNote: action.note }
            : r,
        ),
        notifications: (() => {
          const request = state.bookingRequests.find((r) => r.id === action.requestId);
          if (!request) return state.notifications;
          return notify(state, {
            audience: 'client',
            clientId: request.clientId,
            kind: 'booking-declined',
            title: 'That time is no longer available',
            body: action.note ?? 'Please choose another time that suits you.',
            href: `/client/${request.clientId}/book`,
          });
        })(),
      };

    case 'booking/suggest':
      return {
        ...state,
        bookingRequests: state.bookingRequests.map((r) =>
          r.id === action.requestId
            ? {
                ...r,
                status: 'pending',
                suggestedAt: action.startsAt,
                suggestionNote: action.note,
                respondedAt: nowISO(),
              }
            : r,
        ),
        notifications: (() => {
          const request = state.bookingRequests.find((r) => r.id === action.requestId);
          if (!request) return state.notifications;
          return notify(state, {
            audience: 'client',
            clientId: request.clientId,
            kind: 'booking-declined',
            title: `${state.practitioner.name} suggested ${sessionWhen(action.startsAt)}`,
            body: action.note,
            href: `/client/${request.clientId}/sessions`,
          });
        })(),
      };

    /* ---------------------------------------------------------- preparation */

    case 'preparation/attach': {
      const session = state.sessions.find((s) => s.id === action.sessionId);
      if (!session) return state;
      const preparation: SessionPreparation = {
        id: uid('sp'),
        sessionId: action.sessionId,
        clientId: session.clientId,
        kind: action.kind,
        title: action.title,
        prompt: action.prompt,
        resourceId: action.resourceId,
        assignedAt: nowISO(),
      };
      return {
        ...state,
        preparations: [...state.preparations, preparation],
        sessions: state.sessions.map((s) =>
          s.id === session.id && s.prepState === 'not-started'
            ? { ...s, prepState: 'notes-to-review' }
            : s,
        ),
        notifications: notify(state, {
          audience: 'client',
          clientId: session.clientId,
          kind: 'session-reminder',
          title: `${state.practitioner.name} added something to prepare`,
          body: preparation.title,
          href: `/client/${session.clientId}/sessions/${session.id}/prepare`,
        }),
      };
    }

    case 'preparation/complete': {
      const preparation = state.preparations.find((p) => p.id === action.preparationId);
      if (!preparation || preparation.completedAt) return state;
      const at = nowISO();
      const remaining = state.preparations.filter(
        (p) => p.sessionId === preparation.sessionId && !p.completedAt && p.id !== preparation.id,
      ).length;
      return {
        ...state,
        preparations: state.preparations.map((p) =>
          p.id === preparation.id ? { ...p, completedAt: at, response: action.response } : p,
        ),
        sessions: state.sessions.map((s) =>
          s.id === preparation.sessionId && remaining === 0 ? { ...s, prepState: 'prep-ready' } : s,
        ),
        clients: touchClient(state, preparation.clientId, at),
        notifications: notify(state, {
          audience: 'practitioner',
          clientId: preparation.clientId,
          kind: 'preparation-completed',
          title: `${nameOf(state, preparation.clientId)} completed ${preparation.title}`,
          href: `/practitioner/sessions/${preparation.sessionId}`,
        }),
        events: withEvent(state, {
          clientId: preparation.clientId,
          kind: 'preparation-completed',
          label: `Completed ${preparation.title}`,
          detail: action.response?.slice(0, 92),
          at,
        }),
      };
    }

    case 'preparation/remove':
      return { ...state, preparations: state.preparations.filter((p) => p.id !== action.preparationId) };

    /* ------------------------------------------------------------ sanctuary */

    case 'resource/save': {
      const { draft } = action;
      if (draft.id) {
        return {
          ...state,
          resources: state.resources.map((r) =>
            r.id === draft.id ? { ...r, ...draft, id: r.id, updatedAt: nowISO() } : r,
          ),
        };
      }
      const resource: Resource = {
        id: uid('res'),
        categoryId: draft.categoryId,
        title: draft.title.trim(),
        format: draft.format,
        durationMin: draft.durationMin,
        summary: draft.summary.trim(),
        instructions: draft.instructions,
        url: draft.url,
        tags: draft.tags,
        body: draft.body.filter((line) => line.trim().length > 0),
        status: 'active',
        createdBy: 'practitioner',
        addedOn: toISODate(DEMO_NOW),
        updatedAt: nowISO(),
      };
      return { ...state, resources: [resource, ...state.resources] };
    }

    /* Archive rather than delete: nothing in the library is destroyed. */
    case 'resource/archive':
      return {
        ...state,
        resources: state.resources.map((r) =>
          r.id === action.resourceId ? { ...r, status: 'archived', updatedAt: nowISO() } : r,
        ),
      };

    case 'resource/restore':
      return {
        ...state,
        resources: state.resources.map((r) =>
          r.id === action.resourceId ? { ...r, status: 'active', updatedAt: nowISO() } : r,
        ),
      };

    case 'resource/duplicate': {
      const original = state.resources.find((r) => r.id === action.resourceId);
      if (!original) return state;
      const copy: Resource = {
        ...original,
        id: uid('res'),
        title: `${original.title} (copy)`,
        createdBy: 'practitioner',
        addedOn: toISODate(DEMO_NOW),
        updatedAt: nowISO(),
      };
      return { ...state, resources: [copy, ...state.resources] };
    }

    case 'resource/assign': {
      const { draft } = action;
      const resource = state.resources.find((r) => r.id === draft.resourceId);
      const at = nowISO();
      const created: ResourceAssignment[] = draft.clientIds
        .filter(
          (clientId) =>
            !state.resourceAssignments.some(
              (a) => a.resourceId === draft.resourceId && a.clientId === clientId,
            ),
        )
        .map((clientId) => ({
          id: uid('ra'),
          resourceId: draft.resourceId,
          clientId,
          assignedAt: at,
          assignedBy: 'john',
          message: draft.message,
          startDate: draft.startDate,
          dueDate: draft.dueDate,
          suggestedTime: draft.suggestedTime,
          repeat: draft.repeat,
        }));

      let notifications = state.notifications;
      let events = state.events;
      for (const assignment of created) {
        notifications = [
          {
            id: uid('nt'),
            audience: 'client',
            clientId: assignment.clientId,
            kind: 'resource-assigned',
            title: `${state.practitioner.name} shared ${resource?.title ?? 'a resource'}`,
            at,
            read: false,
            href: `/client/${assignment.clientId}/resource/${draft.resourceId}`,
          },
          ...notifications,
        ];
        events = [
          {
            id: uid('ev'),
            clientId: assignment.clientId,
            kind: 'resource-assigned',
            label: `You shared ${resource?.title ?? 'a resource'}`,
            at,
          },
          ...events,
        ];
      }

      return {
        ...state,
        resourceAssignments: [...state.resourceAssignments, ...created],
        notifications,
        events: events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()),
      };
    }

    case 'resource/open': {
      const resource = state.resources.find((r) => r.id === action.resourceId);
      return {
        ...state,
        resourceAssignments: state.resourceAssignments.map((a) =>
          a.resourceId === action.resourceId && a.clientId === action.clientId && !a.openedAt
            ? { ...a, openedAt: nowISO() }
            : a,
        ),
        events: withEvent(state, {
          clientId: action.clientId,
          kind: 'resource-opened',
          label: `Opened ${resource?.title ?? 'a resource'}`,
          at: nowISO(),
        }),
      };
    }

    /* ------------------------------------------------------------- messages */

    case 'message/send': {
      const at = nowISO();
      const message: Message = {
        id: uid('ms'),
        clientId: action.clientId,
        author: action.author,
        body: action.body,
        kind: action.kind ?? 'message',
        status: 'sent',
        createdAt: at,
        sentAt: at,
        readByPractitioner: action.author === 'practitioner',
        readByClient: action.author === 'client',
      };
      const fromPractitioner = action.author === 'practitioner';
      return {
        ...state,
        messages: [
          ...state.messages.filter((m) => !(m.clientId === action.clientId && m.status === 'draft')),
          message,
        ],
        clients: fromPractitioner ? state.clients : touchClient(state, action.clientId, at),
        notifications: notify(state, {
          audience: fromPractitioner ? 'client' : 'practitioner',
          clientId: action.clientId,
          kind: 'message',
          title: fromPractitioner
            ? `New message from ${state.practitioner.name}`
            : `${nameOf(state, action.clientId)} replied`,
          body: action.body.slice(0, 80),
          href: fromPractitioner
            ? `/client/${action.clientId}/messages`
            : `/practitioner/clients/${action.clientId}/messages`,
        }),
        events: withEvent(state, {
          clientId: action.clientId,
          kind: fromPractitioner ? (message.kind === 'check-in' ? 'check-in-sent' : 'message-sent') : 'message-received',
          label: fromPractitioner
            ? message.kind === 'check-in'
              ? 'You sent a gentle check in'
              : 'You sent a message'
            : 'Replied to you',
          detail: action.body.slice(0, 92),
          at,
        }),
      };
    }

    case 'message/save-draft': {
      const existing = state.messages.find((m) => m.clientId === action.clientId && m.status === 'draft');
      if (existing) {
        return {
          ...state,
          messages: state.messages.map((m) =>
            m.id === existing.id ? { ...m, body: action.body } : m,
          ),
        };
      }
      return {
        ...state,
        messages: [
          ...state.messages,
          {
            id: uid('ms'),
            clientId: action.clientId,
            author: 'practitioner',
            body: action.body,
            kind: 'check-in',
            status: 'draft',
            createdAt: nowISO(),
            readByPractitioner: true,
            readByClient: false,
          },
        ],
      };
    }

    case 'message/mark-read':
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.clientId === action.clientId
            ? action.reader === 'practitioner'
              ? { ...m, readByPractitioner: true }
              : { ...m, readByClient: true }
            : m,
        ),
      };

    case 'notification/read':
      return {
        ...state,
        notifications: state.notifications.map((n) =>
          n.id === action.notificationId ? { ...n, read: true } : n,
        ),
      };

    case 'notification/read-all':
      return {
        ...state,
        notifications: state.notifications.map((n) =>
          n.audience === action.audience ? { ...n, read: true } : n,
        ),
      };

    case 'mode/set':
      return { ...state, mode: action.mode, activeClientId: action.clientId ?? state.activeClientId };

    case 'demo/reset':
      return createInitialState();

    default:
      return state;
  }
}
