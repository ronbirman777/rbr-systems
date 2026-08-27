import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { CalendarClock, Check, ChevronRight, MapPin, Phone, Video, Video as VideoIcon } from 'lucide-react';
import { useApp } from '@/state/AppProvider';
import {
  conflictsFor,
  hasFinished,
  lastSessionFor,
  preparationsFor,
  readingFor,
  reflectionsOf,
  resourcesFor,
} from '@/services/selectors';
import { Monogram } from '@/components/ui/Monogram';
import { PrepBadge, StatusBadge } from '@/components/ui/StatusBadge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { RhythmMetrics } from '@/components/shared/RhythmMetrics';
import { PrivateNote } from '@/components/shared/PrivateNote';
import { Field, TextArea, TextInput } from '@/components/ui/Field';
import { Card, Eyebrow } from '@/components/ui/Primitives';
import { Modal } from '@/components/ui/Overlay';
import { useToast } from '@/components/ui/Toast';
import { CheckInModal } from '@/components/therapist/CheckInModal';
import { PreparationDrawer } from '@/components/therapist/PreparationDrawer';
import { CompleteSessionDrawer } from '@/components/therapist/CompleteSessionDrawer';
import { AssignPracticeDrawer } from '@/components/therapist/AssignPracticeDrawer';
import { AssignResourceDrawer } from '@/components/therapist/AssignResourceDrawer';
import { SessionFormDrawer } from '@/components/therapist/SessionFormDrawer';
import { atTime, clockTime, fullDate, sessionWhen, toISODate } from '@/utils/date';
import { sessionModeLabel } from '@/utils/format';
import type { SeriesScope } from '@/state/store';
import { cn } from '@/utils/cn';

const modeIcon = { video: Video, 'in-person': MapPin, phone: Phone, custom: CalendarClock };

/** The session workspace: context before, direction after. */
export default function SessionDetail() {
  const { sessionId = '' } = useParams();
  const { state, dispatch } = useApp();
  const toast = useToast();
  const navigate = useNavigate();

  const session = state.sessions.find((s) => s.id === sessionId);
  const client = state.clients.find((c) => c.id === session?.clientId);

  const [notes, setNotes] = useState(session?.privateNotes ?? '');
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [prepOpen, setPrepOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [practiceOpen, setPracticeOpen] = useState(false);
  const [resourceOpen, setResourceOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  if (!session || !client) return <Navigate to="/practitioner/sessions" replace />;

  const reading = readingFor(state, client.id);
  const previous = lastSessionFor(state, client.id);
  const ModeIcon = modeIcon[session.mode];
  const past = hasFinished(session);
  const preparation = preparationsFor(state, session.id);
  const done = preparation.filter((p) => p.completedAt).length;
  const shared = reflectionsOf(state, client.id).slice(0, 2);
  const resources = resourcesFor(state, client.id).slice(0, 4);
  const carried = previous?.id !== session.id ? (previous?.actionItems ?? []) : [];
  const cancelled = session.status === 'cancelled';

  return (
    <div className="animate-fade-in">
      <div className="border-b border-sage-line px-6 pb-7 pt-7 sm:px-10 lg:px-12">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[0.8125rem] text-ink-soft">
          <Link to="/practitioner/sessions" className="hover:text-forest hover:underline">
            Calendar
          </Link>
          <ChevronRight className="h-3.5 w-3.5 text-ink-faint" aria-hidden="true" />
          <span className="text-ink">{client.name}</span>
        </nav>

        <header className="mt-5 flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
          <div className="flex min-w-0 items-center gap-4">
            <Monogram person={client} size="lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-display text-[2rem] leading-none text-ink">{client.name}</h1>
                {cancelled ? (
                  <span className="rounded-[6px] bg-rose-wash px-2.5 py-1 text-2xs font-medium text-rose-deep ring-1 ring-inset ring-rose-line">
                    Cancelled
                  </span>
                ) : (
                  <PrepBadge state={session.prepState} />
                )}
              </div>
              <p className="mt-2 flex flex-wrap items-center gap-x-2 text-[0.8125rem] text-ink-soft">
                <span>{sessionWhen(session.startsAt)}</span>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1">
                  <ModeIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  {sessionModeLabel[session.mode]}
                </span>
                <span aria-hidden="true">·</span>
                <span>{session.durationMin} minutes</span>
                <span aria-hidden="true">·</span>
                <span>{fullDate(session.startsAt.slice(0, 10))}</span>
                {session.seriesId && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Part of a standing appointment</span>
                  </>
                )}
              </p>
              {session.location && (
                <p className="mt-1 text-[0.8125rem] text-ink-soft">{session.location}</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {!past && !cancelled && session.mode === 'video' && (
              <Button variant="primary" size="sm" icon={<VideoIcon className="h-4 w-4" />} disabled>
                Start Video
                <span className="ml-1 text-2xs font-normal text-sage">
                  opens {clockTime(session.startsAt)}
                </span>
              </Button>
            )}
            {!cancelled && (
              <>
                <Button size="sm" onClick={() => setPrepOpen(true)}>
                  Session Prep
                </Button>
                {!past && (
                  <Button size="sm" onClick={() => setRescheduleOpen(true)}>
                    Reschedule
                  </Button>
                )}
                {/* Completing stays reachable before the hour as well — the
                    drawer says so — so the arc from booking to follow-up can be
                    walked in one sitting. Until it has happened it is not the
                    obvious action, so it is not the primary button. */}
                <Button
                  variant={past ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setCompleteOpen(true)}
                >
                  Complete Session
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setCancelOpen(true)}>
                  Cancel
                </Button>
              </>
            )}
            <ButtonLink to={`/practitioner/clients/${client.id}`} size="sm" variant="ghost">
              Open Workspace
            </ButtonLink>
          </div>
        </header>

        {cancelled && session.cancelledReason && (
          <p className="mt-4 rounded-card bg-rose-wash/60 px-4 py-3 text-[0.875rem] text-ink">
            Cancelled by {session.cancelledBy === 'client' ? client.name : 'you'} — {session.cancelledReason}
          </p>
        )}
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0 px-6 py-8 sm:px-10 lg:px-12">
          {/* -------------------------------------------------- session brief */}
          <section>
            <Eyebrow className="mb-3">Session brief</Eyebrow>
            <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
              <RhythmMetrics usual={reading.usualRhythm} recent={reading.recentRhythm} showWindow size="sm" />
              <StatusBadge state={reading.state} />
            </div>
            <p className="mt-4 text-[0.9375rem] leading-relaxed text-ink">{reading.headline}</p>
            {reading.insight && (
              <p className="mt-3 rounded-r-card border-l-2 border-amber bg-amber-wash/60 px-4 py-3 text-[0.875rem] text-ink">
                {reading.insight}
              </p>
            )}
            <ul className="mt-4 space-y-1.5">
              {reading.observations.map((observation) => (
                <li key={observation} className="flex gap-2.5 text-[0.875rem] text-ink-soft">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-sage" aria-hidden="true" />
                  {observation}
                </li>
              ))}
            </ul>
          </section>

          {/* --------------------------------------------------- preparation */}
          <section className="mt-9 border-t border-sage-line pt-8">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <Eyebrow>Preparation</Eyebrow>
              <span className="text-2xs text-ink-faint">
                {preparation.length === 0
                  ? 'Nothing attached'
                  : `${done} of ${preparation.length} completed`}
              </span>
            </div>

            {preparation.length === 0 ? (
              <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                <p className="text-[0.875rem] text-ink-soft">
                  Attach something for {client.name} to do before you meet.
                </p>
                <Button size="sm" onClick={() => setPrepOpen(true)}>
                  Attach preparation
                </Button>
              </Card>
            ) : (
              <ul className="space-y-2.5">
                {preparation.map((item) => (
                  <li key={item.id} className="rounded-card border border-sage-line bg-white p-4">
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                          item.completedAt ? 'bg-forest text-cream' : 'border border-sage-line bg-cream',
                        )}
                      >
                        {item.completedAt && <Check className="h-3 w-3" aria-hidden="true" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[0.9375rem] font-medium text-ink">{item.title}</p>
                        <p className="mt-0.5 text-[0.8125rem] text-ink-soft">{item.prompt}</p>
                        {item.response && (
                          <p className="mt-2.5 font-display text-[1.0625rem] italic leading-relaxed text-ink">
                            “{item.response}”
                          </p>
                        )}
                        {!item.completedAt && (
                          <p className="mt-1.5 text-2xs text-ink-faint">Waiting on {client.name}.</p>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {session.preSession && (
              <ul className="mt-4 space-y-4">
                {session.preSession.map((entry) => (
                  <li key={entry.question}>
                    <p className="text-[0.8125rem] text-ink-soft">{entry.question}</p>
                    <p className="mt-1 font-display text-[1.0625rem] italic leading-relaxed text-ink">
                      “{entry.answer}”
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {carried.length > 0 && (
            <section className="mt-9 border-t border-sage-line pt-8">
              <Eyebrow className="mb-3">From the previous session</Eyebrow>
              <ul className="space-y-2">
                {carried.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() =>
                        dispatch({ type: 'session/toggle-action', sessionId: previous!.id, actionId: item.id })
                      }
                      className="flex w-full items-start gap-3 rounded-control py-1.5 text-left transition-colors hover:bg-cream/60"
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border',
                          item.done ? 'border-forest bg-forest' : 'border-sage',
                        )}
                        aria-hidden="true"
                      >
                        {item.done && <span className="h-1.5 w-1.5 rounded-[2px] bg-cream" />}
                      </span>
                      <span className={cn('text-[0.9375rem]', item.done ? 'text-ink-soft line-through' : 'text-ink')}>
                        {item.text}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {shared.length > 0 && (
            <section className="mt-9 border-t border-sage-line pt-8">
              <Eyebrow className="mb-3">Shared reflections</Eyebrow>
              <ul className="space-y-4">
                {shared.map((reflection) => (
                  <li key={reflection.id}>
                    <blockquote className="border-l-2 border-sage pl-4">
                      <p className="font-display text-[1.0625rem] italic leading-relaxed text-ink">
                        “{reflection.body.slice(0, 180)}
                        {reflection.body.length > 180 ? '…' : ''}”
                      </p>
                    </blockquote>
                    <Link
                      to={`/practitioner/clients/${client.id}/reflections`}
                      className="mt-1.5 inline-block text-[0.8125rem] font-medium text-forest-accent hover:underline"
                    >
                      Read in full
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="border-t border-sage-line px-6 py-8 sm:px-10 lg:border-l lg:border-t-0 lg:px-7">
          <PrivateNote label="Private clinical note">
            <TextArea
              rows={10}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes from this session..."
              aria-label="Private clinical note"
              className="border-transparent bg-transparent px-0 py-0 text-[0.875rem] focus:ring-0"
            />
          </PrivateNote>
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-2xs text-ink-faint">Held against {clockTime(session.startsAt)}</p>
            <Button
              size="sm"
              variant="primary"
              disabled={notes === (session.privateNotes ?? '')}
              onClick={() => {
                dispatch({ type: 'session/private-notes', sessionId: session.id, notes });
                toast('Private note saved');
              }}
            >
              Save
            </Button>
          </div>

          {resources.length > 0 && (
            <section className="mt-8">
              <Eyebrow className="mb-3">Resources they have</Eyebrow>
              <ul className="hairlines">
                {resources.map((resource) => (
                  <li key={resource.id}>
                    <Link
                      to={`/practitioner/sanctuary/${resource.id}`}
                      className="block py-2.5 text-[0.875rem] text-ink transition-colors hover:text-forest"
                    >
                      {resource.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="mt-8 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setCheckInOpen(true)}>
              Send Check In
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPracticeOpen(true)}>
              Assign Practice
            </Button>
          </div>
        </aside>
      </div>

      <CheckInModal clientId={client.id} open={checkInOpen} onClose={() => setCheckInOpen(false)} />
      <PreparationDrawer open={prepOpen} onClose={() => setPrepOpen(false)} sessionId={session.id} />
      <AssignPracticeDrawer open={practiceOpen} onClose={() => setPracticeOpen(false)} clientId={client.id} />
      <AssignResourceDrawer
        open={resourceOpen}
        onClose={() => setResourceOpen(false)}
        presetClientIds={[client.id]}
      />
      <SessionFormDrawer open={scheduleOpen} onClose={() => setScheduleOpen(false)} clientId={client.id} />
      <CompleteSessionDrawer
        open={completeOpen}
        onClose={() => setCompleteOpen(false)}
        sessionId={session.id}
        onFollowUp={(next) => {
          setCompleteOpen(false);
          if (next === 'practice') setPracticeOpen(true);
          if (next === 'resource') setResourceOpen(true);
          if (next === 'session') setScheduleOpen(true);
          if (next === 'message') navigate(`/practitioner/clients/${client.id}/messages`);
        }}
      />
      <RescheduleModal
        open={rescheduleOpen}
        onClose={() => setRescheduleOpen(false)}
        sessionId={session.id}
      />
      <CancelModal open={cancelOpen} onClose={() => setCancelOpen(false)} sessionId={session.id} />
    </div>
  );
}

function RescheduleModal({
  open,
  onClose,
  sessionId,
}: {
  open: boolean;
  onClose: () => void;
  sessionId: string;
}) {
  const { state, dispatch } = useApp();
  const toast = useToast();
  const session = state.sessions.find((s) => s.id === sessionId)!;
  const [date, setDate] = useState(toISODate(new Date(session.startsAt)));
  const [time, setTime] = useState(new Date(session.startsAt).toTimeString().slice(0, 5));

  const conflicts = conflictsFor(state, atTime(date, time), session.durationMin, {
    ignoreSessionId: session.id,
    forClientId: session.clientId,
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="Calendar"
      title="Reschedule session"
      description="The client is told about the new time as soon as you save."
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={conflicts.length > 0}
            onClick={() => {
              dispatch({
                type: 'session/reschedule',
                sessionId,
                startsAt: atTime(date, time).toISOString(),
                by: 'practitioner',
              });
              toast(`Moved to ${sessionWhen(atTime(date, time).toISOString())}`);
              onClose();
            }}
          >
            Save new time
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="Date">
          {(id) => <TextInput id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
        </Field>
        <Field label="Start time">
          {(id) => <TextInput id={id} type="time" value={time} onChange={(e) => setTime(e.target.value)} />}
        </Field>
      </div>
      {conflicts.length > 0 && (
        <p className="mt-4 rounded-card border border-amber-line bg-amber-wash/60 px-4 py-3 text-[0.875rem] text-ink">
          {conflicts[0].label} Choose another time.
        </p>
      )}
    </Modal>
  );
}

function CancelModal({
  open,
  onClose,
  sessionId,
}: {
  open: boolean;
  onClose: () => void;
  sessionId: string;
}) {
  const { state, dispatch } = useApp();
  const toast = useToast();
  const session = state.sessions.find((s) => s.id === sessionId)!;
  const [reason, setReason] = useState('');
  const [scope, setScope] = useState<SeriesScope>('this');
  const inSeries = Boolean(session.seriesId);

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="Calendar"
      title="Cancel session"
      description="The appointment stays in the history, marked as cancelled. Nothing is deleted."
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Keep it
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              dispatch({
                type: 'session/cancel',
                sessionId,
                scope,
                reason: reason.trim() || undefined,
                by: 'practitioner',
              });
              toast('Session cancelled');
              onClose();
            }}
          >
            Cancel session
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {inSeries && (
          <fieldset>
            <legend className="eyebrow mb-1.5">This is a standing appointment</legend>
            <div className="space-y-1.5">
              {(
                [
                  ['this', 'Cancel this session only'],
                  ['future', 'Cancel this and future sessions'],
                  ['series', 'Cancel the whole series'],
                ] as [SeriesScope, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={scope === value}
                  onClick={() => setScope(value)}
                  className={cn(
                    'w-full rounded-control border px-3.5 py-2.5 text-left text-[0.875rem] transition-colors',
                    scope === value
                      ? 'border-forest bg-forest text-cream'
                      : 'border-sage-line bg-white text-ink hover:border-sage',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <Field label="Reason" hint="Optional. Shared with the client.">
          {(id) => (
            <TextArea id={id} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          )}
        </Field>
      </div>
    </Modal>
  );
}
