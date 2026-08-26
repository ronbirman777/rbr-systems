import { Link } from 'react-router-dom';
import { ArrowRight, CalendarClock } from 'lucide-react';
import type { Client } from '@/types';
import { useApp } from '@/state/AppProvider';
import type { BaselineReading } from '@/services/baselineEngine';
import {
  chaptersFor,
  dayProgress,
  hasFinished,
  latestReflection,
  nextSessionFor,
  rhythmSeries,
} from '@/services/selectors';
import { RhythmMetrics } from '@/components/shared/RhythmMetrics';
import { RhythmChart } from '@/components/shared/RhythmChart';
import { PrivateNote } from '@/components/shared/PrivateNote';
import { Button, ButtonLink } from '@/components/ui/Button';
import { TextArea } from '@/components/ui/Field';
import { Eyebrow } from '@/components/ui/Primitives';
import { sessionWhen, timeAgo, weekOf, weekdayShort, todayISO } from '@/utils/date';
import { sessionModeLabel } from '@/utils/format';
import { cn } from '@/utils/cn';
import { useState } from 'react';

/**
 * The workspace overview: the baseline reading, and just enough context beside
 * it to decide what to do next. Everything on this screen is private to the
 * practitioner.
 */
export function OverviewPanel({
  client,
  reading,
  onCheckIn,
  onAssign,
}: {
  client: Client;
  reading: BaselineReading;
  onCheckIn: () => void;
  onAssign: () => void;
}) {
  const { state, dispatch } = useApp();
  const reflection = latestReflection(state, client.id);
  const next = nextSessionFor(state, client.id);
  const assignments = state.assignments.filter((a) => a.clientId === client.id && a.active);
  const chapter = chaptersFor(state, client.id).find((c) => c.state === 'in-progress');
  const week = weekOf().map((date) => ({ date, ...dayProgress(state, client.id, date) }));
  const series = rhythmSeries(state, client.id, client.baselineDays);
  const lastSession = state.sessions
    .filter((s) => s.clientId === client.id && hasFinished(s))
    .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime())[0];
  const [note, setNote] = useState('');

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem]">
      {/* ------------------------------------------------------------ main */}
      <div className="min-w-0 px-6 py-8 sm:px-10 lg:px-12">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-[1.625rem] leading-tight text-ink">Personal Rhythm</h2>
          <Eyebrow>{client.baselineDays} Day Baseline</Eyebrow>
        </div>

        <RhythmMetrics
          usual={reading.usualRhythm}
          recent={reading.recentRhythm}
          showWindow
          className="mt-6"
        />

        <p className="mt-5 text-[0.9375rem] leading-relaxed text-ink">
          Recent activity looks different from {client.name}’s usual rhythm.
        </p>

        <RhythmChart points={series} baselineDays={client.baselineDays} className="mt-6" />

        {reading.insight && (
          <p className="mt-7 rounded-r-card border-l-2 border-amber bg-amber-wash/60 px-4 py-3.5 text-[0.9375rem] leading-relaxed text-ink">
            {reading.insight}
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          <Button variant="primary" size="sm" onClick={onCheckIn}>
            Send a Gentle Check In
          </Button>
          <Button size="sm" onClick={onAssign}>
            Adjust Practice Schedule
          </Button>
        </div>

        {/* Approved improvement: the space below the rhythm carries context
            rather than decoration — the week so far, and the session ahead. */}
        <section className="mt-10 border-t border-sage-line pt-8">
          <Eyebrow className="mb-4">This Week</Eyebrow>
          <ul className="flex gap-2 sm:gap-3">
            {week.map((day) => {
              const share = day.total === 0 ? 0 : day.completed / day.total;
              const future = day.date > todayISO();
              return (
                <li key={day.date} className="min-w-0 flex-1 text-center">
                  <div
                    className={cn(
                      'relative flex h-16 items-end overflow-hidden rounded-[10px] border sm:h-20',
                      future ? 'border-dashed border-sage-line' : 'border-sage-line bg-cream',
                    )}
                    aria-hidden="true"
                  >
                    {!future && share > 0 && (
                      <span
                        className={cn(
                          'w-full rounded-[8px] transition-[height] duration-500',
                          share === 1 ? 'bg-forest-accent' : 'bg-sage-soft',
                        )}
                        style={{ height: `${Math.max(12, share * 100)}%` }}
                      />
                    )}
                  </div>
                  <p className="mt-1.5 text-2xs font-medium uppercase tracking-eyebrow text-ink-faint">
                    {weekdayShort(day.date)}
                  </p>
                  <p className="text-2xs tabular-nums text-ink-soft">
                    {future ? '—' : `${day.completed}/${day.total}`}
                  </p>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-2xs text-ink-faint">
            Completed practices per day. Nothing here is shown to {client.name}.
          </p>
        </section>

        {next && (
          <section className="mt-10 border-t border-sage-line pt-8">
            <Eyebrow className="mb-4">Next Session</Eyebrow>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-display text-xl leading-tight text-ink">
                  <CalendarClock className="h-4 w-4 shrink-0 text-sage" aria-hidden="true" />
                  {sessionWhen(next.startsAt)}
                </p>
                <p className="mt-1 text-[0.8125rem] text-ink-soft">
                  {sessionModeLabel[next.mode]} · {next.durationMin} minutes ·{' '}
                  {next.preSession ? 'Preparation submitted' : 'No preparation yet'}
                </p>
              </div>
              <ButtonLink to={`/practitioner/sessions/${next.id}`} size="sm" trailing={<ArrowRight className="h-4 w-4" />}>
                Session Prep
              </ButtonLink>
            </div>
            {chapter && (
              <p className="mt-4 text-[0.8125rem] leading-relaxed text-ink-soft">
                Current chapter · <span className="text-ink">{chapter.title}</span> — {chapter.focus}
              </p>
            )}
          </section>
        )}
      </div>

      {/* ------------------------------------------------------------ rail */}
      <aside className="border-t border-sage-line px-6 py-8 sm:px-10 lg:border-l lg:border-t-0 lg:px-7">
        {reflection && (
          <section>
            <Eyebrow className="mb-3">Recent Reflection</Eyebrow>
            <blockquote className="border-l-2 border-sage pl-3.5">
              <p className="font-display text-[1.0625rem] italic leading-relaxed text-ink">
                “{reflection.body.slice(0, 96)}…”
              </p>
            </blockquote>
            <p className="mt-2.5 text-2xs text-ink-faint">Submitted {timeAgo(reflection.submittedAt)}</p>
            <Link
              to={`/practitioner/clients/${client.id}/reflections`}
              className="mt-2.5 inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-forest-accent hover:underline"
            >
              Read Full Reflection
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </section>
        )}

        <section className="mt-8">
          <Eyebrow className="mb-3">Active Assignments</Eyebrow>
          <ul className="space-y-2.5">
            {assignments.map((assignment) => (
              <li key={assignment.id} className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-baseline gap-2.5">
                  <span className="h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full bg-sage" aria-hidden="true" />
                  <span className="truncate text-[0.875rem] text-ink">{assignment.title}</span>
                </span>
                <span className="shrink-0 text-2xs capitalize text-ink-faint">{assignment.partOfDay}</span>
              </li>
            ))}
          </ul>
          {assignments.length === 0 && <p className="text-[0.8125rem] text-ink-soft">Nothing assigned yet.</p>}
        </section>

        <section className="mt-8">
          <PrivateNote label="Private session notes">
            <TextArea
              rows={5}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => {
                if (lastSession && note.trim()) {
                  dispatch({
                    type: 'session/private-notes',
                    sessionId: lastSession.id,
                    notes: [lastSession.privateNotes, note.trim()].filter(Boolean).join('\n\n'),
                  });
                  setNote('');
                }
              }}
              placeholder="Add a private note..."
              aria-label="Private session notes"
              className="border-transparent bg-transparent px-0 py-0 text-[0.875rem] focus:ring-0"
            />
            <p className="mt-2 text-2xs text-ink-faint">
              Saved against the most recent session. {client.name} never sees this.
            </p>
          </PrivateNote>
        </section>
      </aside>
    </div>
  );
}
