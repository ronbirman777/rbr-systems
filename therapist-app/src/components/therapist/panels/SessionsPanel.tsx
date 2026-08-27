import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, MapPin, Video } from 'lucide-react';
import type { Client } from '@/types';
import { useApp } from '@/state/AppProvider';
import { hasFinished, sessionsOf } from '@/services/selectors';
import { PrepBadge } from '@/components/ui/StatusBadge';
import { PrivateNote } from '@/components/shared/PrivateNote';
import { EmptyState, Eyebrow } from '@/components/ui/Primitives';
import { clockTime, fullDate, sessionWhen } from '@/utils/date';
import { sessionModeLabel } from '@/utils/format';
import { cn } from '@/utils/cn';

/** One client's session timeline, past and upcoming, expandable in place. */
export function SessionsPanel({ client }: { client: Client }) {
  const { state } = useApp();
  const [openId, setOpenId] = useState<string | null>(null);
  const list = sessionsOf(state, client.id).slice().reverse();

  return (
    <div className="px-6 py-8 sm:px-10 lg:px-12">
      <h2 className="font-display text-[1.625rem] leading-tight text-ink">Sessions</h2>
      <p className="mt-1.5 text-[0.9375rem] text-ink-soft">
        {list.filter((s) => hasFinished(s)).length} held · {list.filter((s) => !hasFinished(s)).length} ahead
      </p>

      {list.length === 0 && (
        <EmptyState
          className="mt-7"
          title="No sessions yet"
          description={`Nothing has been booked with ${client.name}. Schedule the first one from the calendar.`}
        />
      )}

      <ul className="mt-7 hairlines border-y border-sage-line">
        {list.map((session) => {
          const ModeIcon = session.mode === 'video' ? Video : MapPin;
          const open = openId === session.id;
          const past = hasFinished(session);
          return (
            <li key={session.id}>
              <button
                type="button"
                onClick={() => setOpenId(open ? null : session.id)}
                aria-expanded={open}
                className="flex w-full items-center gap-4 py-4 text-left"
              >
                <div className="w-32 shrink-0">
                  <p className="text-[0.875rem] font-medium text-ink">{sessionWhen(session.startsAt)}</p>
                  <p className="text-2xs text-ink-faint">{fullDate(session.startsAt.slice(0, 10))}</p>
                </div>
                <p className="flex min-w-0 flex-1 items-center gap-1.5 text-[0.8125rem] text-ink-soft">
                  <ModeIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {sessionModeLabel[session.mode]} · {session.durationMin} min · {session.focus}
                </p>
                <PrepBadge state={session.prepState} className="hidden sm:inline-flex" />
                <ChevronDown
                  className={cn('h-4 w-4 shrink-0 text-ink-faint transition-transform', open && 'rotate-180')}
                  aria-hidden="true"
                />
              </button>

              {open && (
                <div className="animate-fade-in space-y-5 pb-6 pl-0 sm:pl-36">
                  {session.preSession ? (
                    <div>
                      <Eyebrow className="mb-2">Pre-session responses</Eyebrow>
                      <ul className="space-y-3">
                        {session.preSession.map((entry) => (
                          <li key={entry.question}>
                            <p className="text-[0.8125rem] text-ink-soft">{entry.question}</p>
                            <p className="mt-0.5 text-[0.9375rem] leading-relaxed text-ink">{entry.answer}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-[0.8125rem] text-ink-faint">
                      {past ? 'No preparation was submitted.' : 'No preparation submitted yet.'}
                    </p>
                  )}

                  {session.actionItems && session.actionItems.length > 0 && (
                    <div>
                      <Eyebrow className="mb-2">Action items</Eyebrow>
                      <ul className="space-y-1.5">
                        {session.actionItems.map((item) => (
                          <li key={item.id} className="flex gap-2.5 text-[0.875rem] text-ink">
                            <span
                              className={cn(
                                'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                                item.done ? 'bg-forest-accent' : 'bg-sage-line',
                              )}
                              aria-hidden="true"
                            />
                            <span className={cn(item.done && 'text-ink-soft')}>{item.text}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {session.privateNotes && (
                    <PrivateNote label="Private session note" className="max-w-xl">
                      <p className="text-[0.875rem] leading-relaxed text-ink">{session.privateNotes}</p>
                    </PrivateNote>
                  )}

                  <Link
                    to={`/practitioner/sessions/${session.id}`}
                    className="inline-block text-[0.8125rem] font-medium text-forest-accent hover:underline"
                  >
                    Open session workspace
                  </Link>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-4 text-2xs text-ink-faint">
        Times shown are {clockTime('10:30')}-style local times for {client.name}’s timezone.
      </p>
    </div>
  );
}
