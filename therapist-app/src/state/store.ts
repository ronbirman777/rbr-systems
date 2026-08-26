import type {
  ActivityEvent,
  Assignment,
  CheckIn,
  Client,
  Frequency,
  ID,
  ISODate,
  JourneyChapter,
  PartOfDay,
  Practice,
  PracticeType,
  Practitioner,
  PreSessionAnswer,
  Reflection,
  ReminderRule,
  Resource,
  ResourceCategory,
  Session,
} from '@/types';
import {
  assignments as seedAssignments,
  buildEvents,
  checkIns as seedCheckIns,
  clients as seedClients,
  journeyChapters as seedChapters,
  practices as seedPractices,
  practitioner as seedPractitioner,
  reflections as seedReflections,
  resourceCategories as seedCategories,
  resources as seedResources,
  sessions as seedSessions,
} from '@/data';
import { findResource } from '@/data/resources';
import { DEMO_NOW, addDays, toISODate } from '@/utils/date';

/**
 * One store holds both experiences. The practitioner workspace and the client
 * companion read and write the same records, which is what makes the demo's
 * central loop visible with no synchronisation code in between.
 *
 * The shape mirrors what a Supabase/Postgres schema would return, so replacing
 * this reducer with real queries is a service-layer change, not a UI rewrite.
 */
export interface AppState {
  practitioner: Practitioner;
  clients: Client[];
  assignments: Assignment[];
  practices: Practice[];
  sessions: Session[];
  reflections: Reflection[];
  resources: Resource[];
  resourceCategories: ResourceCategory[];
  chapters: JourneyChapter[];
  checkIns: CheckIn[];
  events: ActivityEvent[];
  /** Which experience is on screen. */
  mode: 'practitioner' | 'client';
  /** Which client the companion is showing. */
  activeClientId: string;
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

export type Action =
  | { type: 'practice/complete'; practiceId: ID }
  | { type: 'practice/uncomplete'; practiceId: ID }
  | { type: 'assignment/create'; draft: AssignmentDraft }
  | { type: 'checkIn/save-draft'; clientId: ID; body: string }
  | { type: 'checkIn/send'; clientId: ID; body: string }
  | { type: 'reflection/submit'; clientId: ID; title: string; body: string; practiceId?: ID }
  | { type: 'reflection/mark-read'; reflectionId: ID }
  | { type: 'reflection/private-thought'; reflectionId: ID; thought: string }
  | { type: 'session/pre-session'; sessionId: ID; answers: PreSessionAnswer[] }
  | { type: 'session/private-notes'; sessionId: ID; notes: string }
  | { type: 'session/toggle-action'; sessionId: ID; actionId: ID }
  | { type: 'resource/open'; clientId: ID; resourceId: ID }
  | { type: 'resource/assign'; clientId: ID; resourceId: ID }
  | { type: 'mode/set'; mode: 'practitioner' | 'client'; clientId?: ID }
  | { type: 'demo/reset' };

let counter = 0;
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter += 1)}`;
const nowISO = () => DEMO_NOW.toISOString();

export function createInitialState(): AppState {
  const practices = seedPractices.map((p) => ({ ...p }));
  const sessions = seedSessions.map((s) => ({
    ...s,
    actionItems: s.actionItems?.map((a) => ({ ...a })),
  }));
  const reflections = seedReflections.map((r) => ({ ...r }));
  const checkIns = seedCheckIns.map((c) => ({ ...c }));

  return {
    practitioner: seedPractitioner,
    clients: seedClients.map((c) => ({ ...c })),
    assignments: seedAssignments.map((a) => ({ ...a })),
    practices,
    sessions,
    reflections,
    resources: seedResources.map((r) => ({ ...r })),
    resourceCategories: seedCategories,
    chapters: seedChapters,
    checkIns,
    events: buildEvents(practices, reflections, checkIns, sessions),
    mode: 'practitioner',
    activeClientId: 'emma',
  };
}

const withEvent = (state: AppState, event: ActivityEvent): ActivityEvent[] =>
  [event, ...state.events].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

const touchClient = (state: AppState, clientId: string, at: string): Client[] =>
  state.clients.map((c) => (c.id === clientId ? { ...c, lastActivityAt: at } : c));

/** Dates an assignment covers, from today forward. */
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

const partOfDayFor = (time: string): PartOfDay => {
  const hour = Number(time.slice(0, 2));
  if (hour < 11) return 'morning';
  if (hour < 16) return 'midday';
  if (hour < 21) return 'evening';
  return 'night';
};

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    /**
     * Completion is written by the client companion. The practitioner workspace
     * has no action that produces it — see README, "Completion ownership".
     */
    case 'practice/complete': {
      const practice = state.practices.find((p) => p.id === action.practiceId);
      if (!practice || practice.completedAt) return state;
      const at = nowISO();
      const resource = findResource(practice.resourceId);
      return {
        ...state,
        practices: state.practices.map((p) => (p.id === practice.id ? { ...p, completedAt: at } : p)),
        clients: touchClient(state, practice.clientId, at),
        events: withEvent(state, {
          id: uid('ev'),
          clientId: practice.clientId,
          kind: 'practice-completed',
          label: `Completed ${practice.title}`,
          detail: resource?.title,
          at,
        }),
      };
    }

    case 'practice/uncomplete': {
      return {
        ...state,
        practices: state.practices.map((p) =>
          p.id === action.practiceId ? { ...p, completedAt: undefined } : p,
        ),
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
        events: withEvent(state, {
          id: uid('ev'),
          clientId: draft.clientId,
          kind: 'practice-assigned',
          label: `You assigned ${assignment.title}`,
          detail: `${created.length} ${created.length === 1 ? 'day' : 'days'} from today`,
          at: nowISO(),
        }),
      };
    }

    case 'checkIn/save-draft': {
      const existing = state.checkIns.find((c) => c.clientId === action.clientId && c.status === 'draft');
      if (existing) {
        return {
          ...state,
          checkIns: state.checkIns.map((c) => (c.id === existing.id ? { ...c, body: action.body } : c)),
        };
      }
      return {
        ...state,
        checkIns: [
          { id: uid('ci'), clientId: action.clientId, body: action.body, status: 'draft', createdAt: nowISO() },
          ...state.checkIns,
        ],
      };
    }

    /** Nothing is ever sent without this action, and only a person triggers it. */
    case 'checkIn/send': {
      const at = nowISO();
      const checkIn: CheckIn = {
        id: uid('ci'),
        clientId: action.clientId,
        body: action.body,
        status: 'sent',
        createdAt: at,
        sentAt: at,
      };
      return {
        ...state,
        checkIns: [
          checkIn,
          ...state.checkIns.filter((c) => !(c.clientId === action.clientId && c.status === 'draft')),
        ],
        events: withEvent(state, {
          id: uid('ev'),
          clientId: action.clientId,
          kind: 'check-in-sent',
          label: 'You sent a gentle check in',
          detail: action.body.slice(0, 92),
          at,
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
      const practices = action.practiceId
        ? state.practices.map((p) => (p.id === action.practiceId ? { ...p, completedAt: at } : p))
        : state.practices;

      return {
        ...state,
        reflections: [reflection, ...state.reflections],
        practices,
        clients: touchClient(state, action.clientId, at),
        events: withEvent(state, {
          id: uid('ev'),
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

    case 'session/pre-session': {
      const at = nowISO();
      const session = state.sessions.find((s) => s.id === action.sessionId);
      if (!session) return state;
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === action.sessionId
            ? { ...s, preSession: action.answers, prepState: 'reflection-available' }
            : s,
        ),
        clients: touchClient(state, session.clientId, at),
        events: withEvent(state, {
          id: uid('ev'),
          clientId: session.clientId,
          kind: 'pre-session-completed',
          label: 'Completed session preparation',
          detail: action.answers[0]?.answer.slice(0, 92),
          at,
        }),
      };
    }

    case 'session/private-notes':
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === action.sessionId ? { ...s, privateNotes: action.notes } : s,
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

    case 'resource/open': {
      const resource = state.resources.find((r) => r.id === action.resourceId);
      return {
        ...state,
        events: withEvent(state, {
          id: uid('ev'),
          clientId: action.clientId,
          kind: 'resource-opened',
          label: `Opened ${resource?.title ?? 'a resource'}`,
          at: nowISO(),
        }),
      };
    }

    case 'resource/assign':
      return {
        ...state,
        resources: state.resources.map((r) =>
          r.id === action.resourceId && !r.assignedTo.includes(action.clientId)
            ? { ...r, assignedTo: [...r.assignedTo, action.clientId] }
            : r,
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
