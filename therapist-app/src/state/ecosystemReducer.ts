import type {
  ActivityEvent,
  Client,
  ISODate,
  JourneyChapter,
  Message,
  Practice,
  PracticeType,
  PrivateNote,
  ReflectionVisibility,
  ReminderRule,
  RepeatRule,
  Resource,
  Session,
  Therapist,
  Thread,
  NoteType,
} from '@/types';
import {
  buildInitialEvents,
  clients as seedClients,
  journeyChapters as seedChapters,
  practices as seedPractices,
  privateNotes as seedNotes,
  resources as seedResources,
  sessions as seedSessions,
  therapist as seedTherapist,
  threads as seedThreads,
} from '@/data';
import { DEMO_NOW, atTime, toISODate } from '@/utils/date';
import { resourceById } from '@/data/mockResources';

/**
 * One store holds the whole ecosystem. Both apps read from it and write to it,
 * which is what makes the demo's central loop visible: Emma completes a
 * practice in the client app and John sees it in the therapist app, with no
 * synchronisation code in between.
 *
 * The shape mirrors what a REST/GraphQL backend would return, so swapping the
 * reducer for server calls later is a service-layer change, not a UI rewrite.
 */
export interface EcosystemState {
  therapist: Therapist;
  clients: Client[];
  practices: Practice[];
  sessions: Session[];
  threads: Thread[];
  resources: Resource[];
  notes: PrivateNote[];
  chapters: JourneyChapter[];
  events: ActivityEvent[];
  /** Which experience is on screen. */
  viewAs: 'therapist' | 'client';
  /** The client whose app is being viewed. */
  activeClientId: string;
}

export interface AssignDraft {
  clientIds: string[];
  type: PracticeType;
  title: string;
  instructions: string;
  date: ISODate;
  time: string;
  repeat: RepeatRule;
  reminder: ReminderRule;
  resourceId?: string;
  message?: string;
  invitesReflection: boolean;
}

export type EcosystemAction =
  | {
      type: 'practice/complete';
      practiceId: string;
      reflection?: { text: string; visibility: ReflectionVisibility };
    }
  | { type: 'practice/assign'; draft: AssignDraft }
  | { type: 'reflection/set-visibility'; practiceId: string; visibility: ReflectionVisibility }
  | {
      type: 'message/send';
      clientId: string;
      body: string;
      author: 'therapist' | 'client';
      kind?: 'message' | 'check-in';
    }
  | { type: 'thread/mark-read'; clientId: string; reader: 'therapist' | 'client' }
  | { type: 'note/add'; clientId: string; noteType: NoteType; body: string }
  | { type: 'resource/open'; clientId: string; resourceId: string }
  | { type: 'session/answer-prep'; sessionId: string; promptId: string; answer: string }
  | { type: 'session/save-notes'; sessionId: string; notes: string }
  | { type: 'view/set'; viewAs: 'therapist' | 'client'; clientId?: string }
  | { type: 'demo/reset' };

let counter = 0;
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter += 1)}`;

export function createInitialState(): EcosystemState {
  const practices = seedPractices.map((p) => ({ ...p }));
  const threads = seedThreads.map((t) => ({ ...t, messages: t.messages.map((m) => ({ ...m })) }));
  const sessions = seedSessions.map((s) => ({ ...s, prepPrompts: s.prepPrompts.map((q) => ({ ...q })) }));
  return {
    therapist: seedTherapist,
    clients: seedClients,
    practices,
    sessions,
    threads,
    resources: seedResources,
    notes: seedNotes,
    chapters: seedChapters,
    events: buildInitialEvents(practices, threads, sessions),
    viewAs: 'therapist',
    activeClientId: 'emma',
  };
}

function addEvent(state: EcosystemState, event: ActivityEvent): ActivityEvent[] {
  return [event, ...state.events].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

function expandDates(draft: AssignDraft): ISODate[] {
  const start = new Date(`${draft.date}T00:00:00`);
  const count = draft.repeat === 'once' ? 1 : draft.repeat === 'weekly' ? 4 : 7;
  const dates: ISODate[] = [];
  for (let i = 0; dates.length < count && i < 30; i += 1) {
    const day = new Date(start);
    day.setDate(day.getDate() + (draft.repeat === 'weekly' ? i * 7 : i));
    if (draft.repeat === 'weekdays' && (day.getDay() === 0 || day.getDay() === 6)) continue;
    dates.push(toISODate(day));
  }
  return dates;
}

export function ecosystemReducer(state: EcosystemState, action: EcosystemAction): EcosystemState {
  switch (action.type) {
    /**
     * Completion is written by the client experience only. The therapist app
     * has no action that produces this record — see README, "Completion
     * ownership".
     */
    case 'practice/complete': {
      const practice = state.practices.find((p) => p.id === action.practiceId);
      if (!practice || practice.completion) return state;
      const completedAt = new Date(Math.max(DEMO_NOW.getTime(), Date.now() - 0)).toISOString();
      const at = toISODate(DEMO_NOW) === practice.date ? DEMO_NOW.toISOString() : completedAt;
      const updated: Practice = {
        ...practice,
        completion: { completedAt: at, source: 'client', reflection: action.reflection },
      };
      const resource = resourceById(practice.resourceId);
      let events = addEvent(state, {
        id: uid('e'),
        clientId: practice.clientId,
        kind: 'practice-completed',
        label: `Completed ${practice.title}`,
        detail: resource ? `Using ${resource.title}` : undefined,
        at,
        prominence: 'ambient',
        meta: { practiceId: practice.id },
      });
      if (action.reflection?.visibility === 'shared') {
        events = [
          {
            id: uid('e'),
            clientId: practice.clientId,
            kind: 'reflection-shared',
            label: 'Shared a reflection with you',
            detail: practice.title,
            at,
            prominence: 'notable',
            meta: { practiceId: practice.id },
          },
          ...events,
        ];
      }
      return {
        ...state,
        practices: state.practices.map((p) => (p.id === practice.id ? updated : p)),
        clients: state.clients.map((c) => (c.id === practice.clientId ? { ...c, lastActiveAt: at } : c)),
        events,
      };
    }

    case 'reflection/set-visibility': {
      return {
        ...state,
        practices: state.practices.map((p) =>
          p.id === action.practiceId && p.completion?.reflection
            ? {
                ...p,
                completion: {
                  ...p.completion,
                  reflection: { ...p.completion.reflection, visibility: action.visibility },
                },
              }
            : p,
        ),
        events:
          action.visibility === 'shared'
            ? addEvent(state, {
                id: uid('e'),
                clientId: state.practices.find((p) => p.id === action.practiceId)?.clientId ?? '',
                kind: 'reflection-shared',
                label: 'Shared a reflection with you',
                detail: state.practices.find((p) => p.id === action.practiceId)?.title,
                at: DEMO_NOW.toISOString(),
                prominence: 'notable',
              })
            : state.events,
      };
    }

    case 'practice/assign': {
      const { draft } = action;
      const dates = expandDates(draft);
      const created: Practice[] = [];
      for (const clientId of draft.clientIds) {
        const assignmentId = uid(`a-${clientId}`);
        for (const date of dates) {
          const at = atTime(date, draft.time);
          created.push({
            id: uid(`p-${clientId}`),
            clientId,
            assignmentId,
            type: draft.type,
            title: draft.title,
            instructions: draft.instructions,
            date,
            time: draft.time,
            partOfDay: at.getHours() < 11 ? 'morning' : at.getHours() < 17 ? 'midday' : 'evening',
            durationMin: resourceById(draft.resourceId)?.durationMin ?? 10,
            repeat: draft.repeat,
            reminder: draft.reminder,
            resourceId: draft.resourceId,
            message: draft.message,
            invitesReflection: draft.invitesReflection,
            assignedAt: DEMO_NOW.toISOString(),
            assignedBy: 'john',
          });
        }
      }
      let events = state.events;
      for (const clientId of draft.clientIds) {
        events = [
          {
            id: uid('e'),
            clientId,
            kind: 'practice-assigned',
            label: `You assigned ${draft.title}`,
            detail: dates.length > 1 ? `${dates.length} days from ${draft.date}` : draft.date,
            at: DEMO_NOW.toISOString(),
            prominence: 'ambient',
          },
          ...events,
        ];
      }
      return { ...state, practices: [...state.practices, ...created], events };
    }

    case 'message/send': {
      const thread = state.threads.find((t) => t.clientId === action.clientId);
      if (!thread) return state;
      const message: Message = {
        id: uid('m'),
        threadId: thread.id,
        author: action.author,
        body: action.body,
        sentAt: DEMO_NOW.toISOString(),
        readByTherapist: action.author === 'therapist',
        readByClient: action.author === 'client',
        kind: action.kind ?? 'message',
      };
      return {
        ...state,
        threads: state.threads.map((t) =>
          t.id === thread.id ? { ...t, messages: [...t.messages, message], draft: undefined } : t,
        ),
        clients:
          action.author === 'client'
            ? state.clients.map((c) =>
                c.id === action.clientId ? { ...c, lastActiveAt: message.sentAt } : c,
              )
            : state.clients,
        events: addEvent(state, {
          id: uid('e'),
          clientId: action.clientId,
          kind:
            action.author === 'client'
              ? 'message-received'
              : message.kind === 'check-in'
                ? 'check-in-sent'
                : 'message-sent',
          label:
            action.author === 'client'
              ? 'Replied to you'
              : message.kind === 'check-in'
                ? 'You sent a check-in'
                : 'You sent a message',
          detail: action.body.slice(0, 90),
          at: message.sentAt,
          prominence: action.author === 'client' ? 'notable' : 'notable',
        }),
      };
    }

    case 'thread/mark-read': {
      return {
        ...state,
        threads: state.threads.map((t) =>
          t.clientId === action.clientId
            ? {
                ...t,
                messages: t.messages.map((m) =>
                  action.reader === 'therapist'
                    ? { ...m, readByTherapist: true }
                    : { ...m, readByClient: true },
                ),
              }
            : t,
        ),
      };
    }

    case 'note/add': {
      const note: PrivateNote = {
        id: uid('n'),
        clientId: action.clientId,
        type: action.noteType,
        body: action.body,
        createdAt: DEMO_NOW.toISOString(),
        authorId: 'john',
      };
      return { ...state, notes: [note, ...state.notes] };
    }

    case 'resource/open': {
      const resource = state.resources.find((r) => r.id === action.resourceId);
      return {
        ...state,
        events: addEvent(state, {
          id: uid('e'),
          clientId: action.clientId,
          kind: 'resource-opened',
          label: `Opened ${resource?.title ?? 'a resource'}`,
          at: DEMO_NOW.toISOString(),
          prominence: 'ambient',
        }),
      };
    }

    case 'session/answer-prep': {
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === action.sessionId
            ? {
                ...s,
                prepPrompts: s.prepPrompts.map((q) =>
                  q.id === action.promptId
                    ? { ...q, answer: action.answer, answeredAt: DEMO_NOW.toISOString() }
                    : q,
                ),
              }
            : s,
        ),
      };
    }

    case 'session/save-notes': {
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === action.sessionId ? { ...s, notes: action.notes } : s,
        ),
      };
    }

    case 'view/set': {
      return {
        ...state,
        viewAs: action.viewAs,
        activeClientId: action.clientId ?? state.activeClientId,
      };
    }

    case 'demo/reset':
      return createInitialState();

    default:
      return state;
  }
}
