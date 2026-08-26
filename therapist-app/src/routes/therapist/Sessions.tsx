import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useApp } from '@/state/AppProvider';
import { sessionsOnDay, upcomingSessions, pastSessions } from '@/services/selectors';
import { PageHeader } from '@/components/therapist/PageHeader';
import { SessionItem } from '@/components/therapist/SessionItem';
import { Button } from '@/components/ui/Button';
import { EmptyState, Eyebrow } from '@/components/ui/Primitives';
import { addDays, fullDate, todayISO, toISODate, weekOf, weekdayShort, relativeDay } from '@/utils/date';
import { cn } from '@/utils/cn';

type View = 'day' | 'week' | 'agenda';

/** Day, week and agenda over the same set of sessions. */
export default function Sessions() {
  const { state } = useApp();
  const [view, setView] = useState<View>('day');
  const [anchor, setAnchor] = useState(todayISO());

  const day = useMemo(() => sessionsOnDay(state, anchor), [state, anchor]);
  const week = useMemo(
    () => weekOf(anchor).map((date) => ({ date, sessions: sessionsOnDay(state, date) })),
    [state, anchor],
  );
  const ahead = useMemo(() => upcomingSessions(state), [state]);
  const held = useMemo(() => pastSessions(state).slice(0, 8), [state]);

  return (
    <div className="animate-fade-in">
      <div className="border-b border-sage-line px-6 py-8 sm:px-10 lg:px-12">
        <PageHeader
          eyebrow="Sessions"
          title="The shape of the week"
          lede={`${sessionsOnDay(state, todayISO()).length} today · ${ahead.length} still ahead`}
        />
      </div>

      <div className="px-6 py-7 sm:px-10 lg:px-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex gap-1.5" role="tablist" aria-label="Session view">
            {(['day', 'week', 'agenda'] as View[]).map((option) => (
              <button
                key={option}
                role="tab"
                aria-selected={option === view}
                onClick={() => setView(option)}
                className={cn(
                  'min-h-[2.25rem] rounded-full border px-4 text-[0.8125rem] font-medium capitalize transition-colors',
                  option === view
                    ? 'border-forest bg-forest text-cream'
                    : 'border-sage-line bg-white text-ink-soft hover:border-sage hover:text-ink',
                )}
              >
                {option}
              </button>
            ))}
          </div>

          {view !== 'agenda' && (
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                className="w-10 px-0"
                aria-label={view === 'day' ? 'Previous day' : 'Previous week'}
                onClick={() => setAnchor(toISODate(addDays(anchor, view === 'day' ? -1 : -7)))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button size="sm" onClick={() => setAnchor(todayISO())} disabled={anchor === todayISO()}>
                Today
              </Button>
              <Button
                size="sm"
                className="w-10 px-0"
                aria-label={view === 'day' ? 'Next day' : 'Next week'}
                onClick={() => setAnchor(toISODate(addDays(anchor, view === 'day' ? 1 : 7)))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {view === 'day' && (
          <section className="mt-7">
            <h2 className="font-display text-[1.625rem] leading-tight text-ink">{fullDate(anchor)}</h2>
            {day.length === 0 ? (
              <div className="mt-5">
                <EmptyState title="Nothing scheduled on this day" />
              </div>
            ) : (
              <div className="mt-4 hairlines border-y border-sage-line">
                {day.map((session) => (
                  <SessionItem key={session.id} session={session} showFinished />
                ))}
              </div>
            )}
          </section>
        )}

        {view === 'week' && (
          <section className="mt-7">
            <div className="grid gap-3 md:grid-cols-7">
              {week.map((column) => {
                const isToday = column.date === todayISO();
                return (
                  <div
                    key={column.date}
                    className={cn(
                      'rounded-card border p-3',
                      isToday ? 'border-sage bg-sage-wash/40' : 'border-sage-line bg-white',
                    )}
                  >
                    <p
                      className={cn(
                        'text-2xs font-semibold uppercase tracking-eyebrow',
                        isToday ? 'text-forest' : 'text-ink-faint',
                      )}
                    >
                      {weekdayShort(column.date)} {Number(column.date.slice(8))}
                    </p>
                    <ul className="mt-2.5 space-y-2">
                      {column.sessions.map((session) => {
                        const client = state.clients.find((c) => c.id === session.clientId);
                        return (
                          <li key={session.id}>
                            <a
                              href={`/practitioner/sessions/${session.id}`}
                              className="block rounded-[8px] border border-sage-line bg-cream/70 px-2.5 py-2 transition-colors hover:border-sage"
                            >
                              <span className="block text-2xs tabular-nums text-ink-soft">
                                {session.startsAt.slice(11, 16)}
                              </span>
                              <span className="block truncate text-[0.8125rem] font-medium text-ink">
                                {client?.name}
                              </span>
                            </a>
                          </li>
                        );
                      })}
                      {column.sessions.length === 0 && (
                        <li className="text-2xs text-ink-faint">—</li>
                      )}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {view === 'agenda' && (
          <section className="mt-7 space-y-9">
            <div>
              <Eyebrow className="mb-3">Ahead</Eyebrow>
              <div className="hairlines border-y border-sage-line">
                {ahead.map((session) => (
                  <SessionItem key={session.id} session={session} showDay />
                ))}
              </div>
            </div>
            <div>
              <Eyebrow className="mb-3">Recently held</Eyebrow>
              <ul className="hairlines border-y border-sage-line">
                {held.map((session) => {
                  const client = state.clients.find((c) => c.id === session.clientId);
                  return (
                    <li key={session.id}>
                      <a
                        href={`/practitioner/sessions/${session.id}`}
                        className="flex items-center justify-between gap-4 py-3.5 transition-colors hover:bg-cream/50"
                      >
                        <span className="min-w-0">
                          <span className="block text-[0.9375rem] text-ink">{client?.name}</span>
                          <span className="block text-[0.8125rem] text-ink-soft">{session.focus}</span>
                        </span>
                        <span className="shrink-0 text-[0.8125rem] text-ink-soft">
                          {relativeDay(session.startsAt)}
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
