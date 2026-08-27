import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useApp } from '@/state/AppProvider';
import {
  allReadings,
  messagesOf,
  pendingRequests,
  practiceState,
  unreadReflections,
  upcomingSessions,
} from '@/services/selectors';
import { attentionStates } from '@/services/baselineEngine';
import { PageHeader } from '@/components/therapist/PageHeader';
import { AssignPracticeDrawer } from '@/components/therapist/AssignPracticeDrawer';
import { Monogram } from '@/components/ui/Monogram';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { EmptyState, Eyebrow } from '@/components/ui/Primitives';
import { clockTime, sessionWhen, timeAgo, todayISO } from '@/utils/date';

/**
 * Continuous Care: what is live across the practice right now.
 *
 * Deliberately not a second analytics screen — every row is a person and
 * something that has actually happened, ordered so the useful things are first.
 */
export default function ContinuousCare() {
  const { state } = useApp();
  const [assignOpen, setAssignOpen] = useState(false);

  const today = todayISO();
  const readings = useMemo(() => allReadings(state), [state]);

  const activeToday = state.practices.filter((p) => p.date === today);
  const completedToday = activeToday.filter((p) => p.completedAt);
  const openToday = activeToday.filter((p) => practiceState(p) === 'available');
  const reflections = unreadReflections(state).slice(0, 4);
  const changes = readings
    .filter((r) => attentionStates.includes(r.reading.state) || r.reading.state === 're-engaged')
    .sort((a, b) => b.reading.attentionWeight - a.reading.attentionWeight);
  const ahead = upcomingSessions(state).slice(0, 5);
  const recentCheckIns = state.clients
    .flatMap((c) =>
      messagesOf(state, c.id)
        .filter((m) => m.author === 'practitioner' && m.kind === 'check-in')
        .slice(-1),
    )
    .sort((a, b) => new Date(b.sentAt ?? 0).getTime() - new Date(a.sentAt ?? 0).getTime())
    .slice(0, 3);
  const requests = pendingRequests(state);

  const nameOf = (id: string) => state.clients.find((c) => c.id === id)?.name ?? '';

  return (
    <div className="animate-fade-in">
      <div className="border-b border-sage-line px-6 py-8 sm:px-10 lg:px-12">
        <PageHeader
          eyebrow="Continuous Care"
          title="What is live right now"
          lede="Across every client, between every session."
          aside={
            <Button variant="primary" size="sm" onClick={() => setAssignOpen(true)} icon={<Plus className="h-4 w-4" />}>
              Assign Practice
            </Button>
          }
        />
      </div>

      <div className="px-6 py-8 sm:px-10 lg:px-12">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-b border-sage-line pb-7 lg:grid-cols-4">
          {[
            { label: 'Practices today', value: activeToday.length },
            { label: 'Completed today', value: completedToday.length },
            { label: 'Still open today', value: openToday.length },
            { label: 'Booking requests', value: requests.length },
          ].map((stat) => (
            <div key={stat.label}>
              <dt className="eyebrow">{stat.label}</dt>
              <dd className="mt-1.5 text-[1.75rem] font-semibold leading-none tabular-nums text-ink">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="grid min-w-0 gap-x-12 gap-y-10 pt-8 xl:grid-cols-2">
          <section className="min-w-0">
            <Eyebrow className="mb-4">Rhythm changes</Eyebrow>
            {changes.length === 0 ? (
              <EmptyState title="Nothing has shifted" />
            ) : (
              <ul className="hairlines">
                {changes.map((entry) => (
                  <li key={entry.client.id}>
                    <Link
                      to={`/practitioner/clients/${entry.client.id}`}
                      className="flex items-center gap-3.5 py-3.5 transition-colors hover:bg-cream/50"
                    >
                      <Monogram person={entry.client} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[0.9375rem] font-medium text-ink">{entry.client.name}</span>
                        <span className="block text-[0.8125rem] leading-snug text-ink-soft">
                          {entry.reading.headline}
                        </span>
                        <span className="mt-2 block sm:hidden">
                          <StatusBadge state={entry.reading.state} />
                        </span>
                      </span>
                      <span className="hidden shrink-0 sm:block">
                        <StatusBadge state={entry.reading.state} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="min-w-0">
            <Eyebrow className="mb-4">Recent reflections</Eyebrow>
            {reflections.length === 0 ? (
              <EmptyState title="Nothing new to read" description="Reflections you have not opened appear here." />
            ) : (
              <ul className="hairlines">
                {reflections.map((reflection) => (
                  <li key={reflection.id}>
                    <Link
                      to={`/practitioner/clients/${reflection.clientId}/reflections`}
                      className="block py-3.5 transition-colors hover:bg-cream/50"
                    >
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="text-[0.9375rem] font-medium text-ink">
                          {nameOf(reflection.clientId)}
                        </span>
                        <span className="shrink-0 text-2xs text-ink-faint">
                          {timeAgo(reflection.submittedAt)}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate font-display text-[0.9375rem] italic text-ink-soft">
                        “{reflection.body.slice(0, 76)}…”
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="min-w-0">
            <Eyebrow className="mb-4">Practices still open today</Eyebrow>
            {openToday.length === 0 ? (
              <EmptyState title="Everything due today is done" />
            ) : (
              <ul className="hairlines">
                {openToday.slice(0, 8).map((practice) => (
                  <li key={practice.id} className="flex items-center justify-between gap-4 py-3">
                    <span className="min-w-0">
                      <span className="block text-[0.9375rem] text-ink">{practice.title}</span>
                      <span className="block text-[0.8125rem] text-ink-soft">
                        {nameOf(practice.clientId)} · {clockTime(practice.targetTime)}
                      </span>
                    </span>
                    <Link
                      to={`/practitioner/clients/${practice.clientId}/practices`}
                      className="shrink-0 text-[0.8125rem] font-medium text-forest-accent hover:underline"
                    >
                      Open
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="min-w-0">
            <Eyebrow className="mb-4">Upcoming sessions</Eyebrow>
            <ul className="hairlines">
              {ahead.map((session) => (
                <li key={session.id}>
                  <Link
                    to={`/practitioner/sessions/${session.id}`}
                    className="flex items-center justify-between gap-4 py-3 transition-colors hover:bg-cream/50"
                  >
                    <span className="min-w-0">
                      <span className="block text-[0.9375rem] text-ink">{nameOf(session.clientId)}</span>
                      <span className="block text-[0.8125rem] text-ink-soft">{session.focus}</span>
                    </span>
                    <span className="shrink-0 text-[0.8125rem] text-ink-soft">
                      {sessionWhen(session.startsAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {recentCheckIns.length > 0 && (
            <section className="min-w-0 xl:col-span-2">
              <Eyebrow className="mb-4">Check ins you have sent</Eyebrow>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {recentCheckIns.map((checkIn) => (
                  <li key={checkIn.id} className="rounded-card border border-sage-line bg-white p-4">
                    <p className="flex items-baseline justify-between gap-3">
                      <span className="text-[0.9375rem] font-medium text-ink">{nameOf(checkIn.clientId)}</span>
                      <span className="shrink-0 text-2xs text-ink-faint">
                        {checkIn.sentAt ? timeAgo(checkIn.sentAt) : ''}
                      </span>
                    </p>
                    <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-soft">{checkIn.body}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      <AssignPracticeDrawer open={assignOpen} onClose={() => setAssignOpen(false)} />
    </div>
  );
}
