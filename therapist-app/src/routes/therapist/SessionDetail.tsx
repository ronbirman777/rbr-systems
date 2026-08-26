import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ChevronRight, MapPin, Video } from 'lucide-react';
import { useApp } from '@/state/AppProvider';
import { hasFinished, lastSessionFor, readingFor } from '@/services/selectors';
import { Monogram } from '@/components/ui/Monogram';
import { PrepBadge, StatusBadge } from '@/components/ui/StatusBadge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { RhythmMetrics } from '@/components/shared/RhythmMetrics';
import { PrivateNote } from '@/components/shared/PrivateNote';
import { TextArea } from '@/components/ui/Field';
import { Eyebrow } from '@/components/ui/Primitives';
import { CheckInModal } from '@/components/therapist/CheckInModal';
import { clockTime, fullDate, sessionWhen } from '@/utils/date';
import { sessionModeLabel } from '@/utils/format';
import { cn } from '@/utils/cn';

/** The session workspace: context, what the client wrote, and a private editor. */
export default function SessionDetail() {
  const { sessionId = '' } = useParams();
  const { state, dispatch } = useApp();
  const [checkInOpen, setCheckInOpen] = useState(false);

  const session = state.sessions.find((s) => s.id === sessionId);
  const client = state.clients.find((c) => c.id === session?.clientId);
  const [notes, setNotes] = useState(session?.privateNotes ?? '');

  if (!session || !client) return <Navigate to="/practitioner/sessions" replace />;

  const reading = readingFor(state, client.id);
  const previous = lastSessionFor(state, client.id);
  const ModeIcon = session.mode === 'video' ? Video : MapPin;
  const past = hasFinished(session);
  const carriedActions = previous?.id !== session.id ? previous?.actionItems ?? [] : [];

  return (
    <div className="animate-fade-in">
      <div className="border-b border-sage-line px-6 pb-7 pt-7 sm:px-10 lg:px-12">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[0.8125rem] text-ink-soft">
          <Link to="/practitioner/sessions" className="hover:text-forest hover:underline">
            Sessions
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
                <PrepBadge state={session.prepState} />
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
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="sm" onClick={() => setCheckInOpen(true)}>
              Send Check In
            </Button>
            <ButtonLink to={`/practitioner/clients/${client.id}`} size="sm">
              Open Workspace
            </ButtonLink>
          </div>
        </header>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0 px-6 py-8 sm:px-10 lg:px-12">
          <section>
            <Eyebrow className="mb-3">Client context</Eyebrow>
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

          <section className="mt-9 border-t border-sage-line pt-8">
            <Eyebrow className="mb-3">Pre-session responses</Eyebrow>
            {session.preSession ? (
              <ul className="space-y-4">
                {session.preSession.map((entry) => (
                  <li key={entry.question}>
                    <p className="text-[0.8125rem] text-ink-soft">{entry.question}</p>
                    <p className="mt-1 font-display text-[1.0625rem] italic leading-relaxed text-ink">
                      “{entry.answer}”
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[0.875rem] text-ink-faint">
                {past
                  ? 'No preparation was submitted for this session.'
                  : `${client.name} has not sent preparation yet.`}
              </p>
            )}
          </section>

          {carriedActions.length > 0 && (
            <section className="mt-9 border-t border-sage-line pt-8">
              <Eyebrow className="mb-3">From the previous session</Eyebrow>
              <ul className="space-y-2">
                {carriedActions.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() =>
                        dispatch({
                          type: 'session/toggle-action',
                          sessionId: previous!.id,
                          actionId: item.id,
                        })
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
                      <span
                        className={cn('text-[0.9375rem]', item.done ? 'text-ink-soft line-through' : 'text-ink')}
                      >
                        {item.text}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="border-t border-sage-line px-6 py-8 sm:px-10 lg:border-l lg:border-t-0 lg:px-7">
          <PrivateNote label="Private clinical note">
            <TextArea
              rows={12}
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
              onClick={() => dispatch({ type: 'session/private-notes', sessionId: session.id, notes })}
            >
              Save
            </Button>
          </div>
        </aside>
      </div>

      <CheckInModal clientId={client.id} open={checkInOpen} onClose={() => setCheckInOpen(false)} />
    </div>
  );
}
