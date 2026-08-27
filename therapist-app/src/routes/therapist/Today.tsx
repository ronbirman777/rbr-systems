import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '@/state/AppProvider';
import { allReadings, pendingRequests, preparationProgress, todaysSessions, upcomingSessions } from '@/services/selectors';
import { attentionStates } from '@/services/baselineEngine';
import { PageHeader } from '@/components/therapist/PageHeader';
import { SessionItem } from '@/components/therapist/SessionItem';
import { CheckInModal } from '@/components/therapist/CheckInModal';
import { BookingRequestCard } from '@/components/therapist/BookingRequestCard';
import { Monogram } from '@/components/ui/Monogram';
import { Button, ButtonLink } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { RhythmMetrics } from '@/components/shared/RhythmMetrics';
import { Card, EmptyState, Eyebrow } from '@/components/ui/Primitives';
import { briefingDate, greeting, relativeDay } from '@/utils/date';

/**
 * Today's Briefing.
 *
 * Not a dashboard: it answers three questions in order — who may need
 * attention, what is going well, and what is happening today. There are no
 * totals, no charts and nothing to act on that is not a person.
 */
export default function Today() {
  const { state } = useApp();
  const [checkInFor, setCheckInFor] = useState<string | null>(null);

  const readings = useMemo(() => allReadings(state), [state]);
  const sessions = useMemo(() => todaysSessions(state), [state]);
  const requests = useMemo(() => pendingRequests(state), [state]);
  const awaitingPrep = useMemo(
    () =>
      upcomingSessions(state)
        .map((session) => ({ session, prep: preparationProgress(state, session.id) }))
        .filter(({ prep }) => prep.total > 0 && prep.completed < prep.total)
        .slice(0, 3),
    [state],
  );

  const attention = readings
    .filter((entry) => attentionStates.includes(entry.reading.state))
    .sort((a, b) => b.reading.attentionWeight - a.reading.attentionWeight);

  const [lead, ...rest] = attention;
  const momentum = readings.filter(
    (entry) => entry.reading.state === 're-engaged' || entry.reading.state === 'on-track',
  );
  const highlighted = momentum.find((m) => m.client.id === 'sophie') ?? momentum[0];

  return (
    <div className="animate-fade-in">
      <div className="border-b border-sage-line px-6 py-8 sm:px-10 lg:px-12">
        <PageHeader
          eyebrow="Today's Briefing"
          title={`${greeting()}, ${state.practitioner.name}.`}
          lede="Here's what may be helpful to know today."
          aside={briefingDate()}
        />
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_23.5rem]">
        {/* ------------------------------------------------------- briefing */}
        <div className="min-w-0 px-6 py-8 sm:px-10 lg:px-12">
          {requests.length > 0 && (
            <section className="mb-10">
              <Eyebrow className="mb-4">
                Booking {requests.length === 1 ? 'Request' : 'Requests'}
              </Eyebrow>
              <div className="space-y-3">
                {requests.map((request) => (
                  <BookingRequestCard key={request.id} request={request} />
                ))}
              </div>
            </section>
          )}

          <section>
            <Eyebrow className="mb-4">Needs Attention</Eyebrow>

            {!lead ? (
              <EmptyState
                title="Nothing needs your attention today"
                description="Every client's activity is in line with their own usual rhythm."
              />
            ) : (
              <div className="space-y-3">
                <Card className="p-5 sm:p-6">
                  <div className="flex items-start gap-4">
                    <Monogram person={lead.client} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                        <div className="min-w-0">
                          <h3 className="font-display text-[1.375rem] leading-tight text-ink">
                            {lead.client.name}
                          </h3>
                          <p className="mt-0.5 text-[0.8125rem] text-ink-soft">Focus: {lead.client.focus}</p>
                        </div>
                        <StatusBadge state={lead.reading.state} />
                      </div>

                      <p className="mt-4 text-[0.9375rem] leading-relaxed text-ink">
                        Recent activity is noticeably different from {lead.client.name}’s usual rhythm.
                      </p>

                      <RhythmMetrics
                        usual={lead.reading.usualRhythm}
                        recent={lead.reading.recentRhythm}
                        className="mt-5"
                      />

                      <div className="mt-6 flex flex-wrap gap-2">
                        <Button variant="primary" size="sm" onClick={() => setCheckInFor(lead.client.id)}>
                          Send a Gentle Check In
                        </Button>
                        <ButtonLink to={`/practitioner/clients/${lead.client.id}`} size="sm">
                          View Context
                        </ButtonLink>
                      </div>
                    </div>
                  </div>
                </Card>

                {rest.map((entry) => (
                  <Card key={entry.client.id} className="p-4 sm:p-5">
                    <div className="flex items-start gap-3.5 sm:items-center">
                      <Monogram person={entry.client} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                          <p className="font-display text-lg leading-tight text-ink">{entry.client.name}</p>
                          <StatusBadge state={entry.reading.state} />
                        </div>
                        <p className="mt-1 text-[0.8125rem] leading-snug text-ink-soft">
                          {entry.reading.headline}
                        </p>
                        <ButtonLink
                          to={`/practitioner/clients/${entry.client.id}`}
                          size="sm"
                          className="mt-3 sm:hidden"
                        >
                          View Context
                        </ButtonLink>
                      </div>
                      <ButtonLink
                        to={`/practitioner/clients/${entry.client.id}`}
                        size="sm"
                        className="hidden shrink-0 sm:inline-flex"
                      >
                        View Context
                      </ButtonLink>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>

          {highlighted && (
            <section className="mt-10 border-t border-sage-line pt-8">
              <Eyebrow className="mb-4">Positive Momentum</Eyebrow>
              <div className="flex items-start gap-3.5">
                <Monogram person={highlighted.client} size="sm" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <Link
                      to={`/practitioner/clients/${highlighted.client.id}`}
                      className="font-display text-xl leading-tight text-ink hover:text-forest"
                    >
                      {highlighted.client.name}
                    </Link>
                    <StatusBadge state={highlighted.reading.state} />
                  </div>
                  <p className="mt-2 font-display text-[1.0625rem] italic leading-relaxed text-ink-soft">
                    “{highlighted.client.summary}”
                  </p>
                </div>
              </div>
            </section>
          )}

        </div>

        {/* --------------------------------------------------------- rail */}
        <aside className="border-t border-sage-line px-6 py-8 sm:px-10 lg:border-l lg:border-t-0 lg:px-8">
          <Eyebrow className="mb-3">Today's Sessions</Eyebrow>
          {sessions.length === 0 ? (
            <p className="py-4 text-[0.8125rem] text-ink-soft">Nothing is scheduled today.</p>
          ) : (
            <div className="hairlines -my-1">
              {sessions.map((session) => (
                <SessionItem key={session.id} session={session} />
              ))}
            </div>
          )}
          <ButtonLink to="/practitioner/sessions" variant="ghost" size="sm" className="-ml-3.5 mt-4">
            Open calendar
          </ButtonLink>

          {awaitingPrep.length > 0 && (
            <section className="mt-9 border-t border-sage-line pt-7">
              <Eyebrow className="mb-3">Preparation Waiting</Eyebrow>
              <ul className="space-y-2.5">
                {awaitingPrep.map(({ session, prep }) => {
                  const client = state.clients.find((c) => c.id === session.clientId);
                  return (
                    <li key={session.id}>
                      <Link
                        to={`/practitioner/sessions/${session.id}`}
                        className="block rounded-card px-1 py-1.5 transition-colors hover:bg-cream/60"
                      >
                        <span className="block text-[0.875rem] text-ink">{client?.name}</span>
                        <span className="block text-2xs text-ink-soft">
                          {prep.completed} of {prep.total} completed · {relativeDay(session.startsAt)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </aside>
      </div>

      <CheckInModal clientId={checkInFor} open={checkInFor !== null} onClose={() => setCheckInFor(null)} />
    </div>
  );
}
