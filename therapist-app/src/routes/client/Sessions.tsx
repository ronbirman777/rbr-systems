import { Link, useParams } from 'react-router-dom';
import { ArrowRight, MapPin, Video } from 'lucide-react';
import { useApp } from '@/state/AppProvider';
import { hasFinished, sessionsOf } from '@/services/selectors';
import { Card, Eyebrow } from '@/components/ui/Primitives';
import { fullDate, sessionWhen } from '@/utils/date';
import { sessionModeLabel } from '@/utils/format';

export default function ClientSessions() {
  const { clientId = 'emma' } = useParams();
  const { state } = useApp();
  const client = state.clients.find((c) => c.id === clientId) ?? state.clients[0];
  const base = `/client/${client.id}`;

  const all = sessionsOf(state, client.id);
  const ahead = all.filter((s) => !hasFinished(s));
  const held = all.filter((s) => hasFinished(s)).reverse();

  return (
    <div className="animate-fade-in">
      <h1 className="font-display text-[1.875rem] leading-tight text-ink">Sessions</h1>
      <p className="mt-2 text-[0.9375rem] text-ink-soft">With {state.practitioner.name}.</p>

      {ahead.length > 0 && (
        <section className="mt-7">
          <Eyebrow>Coming up</Eyebrow>
          <ul className="mt-3 space-y-3">
            {ahead.map((session) => {
              const ModeIcon = session.mode === 'video' ? Video : MapPin;
              return (
                <li key={session.id}>
                  <Link to={`${base}/sessions/${session.id}`}>
                    <Card className="p-4 transition-colors hover:border-sage">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[1.0625rem] font-semibold text-ink">
                            {sessionWhen(session.startsAt)}
                          </p>
                          <p className="mt-1 flex items-center gap-1.5 text-[0.8125rem] text-ink-soft">
                            <ModeIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            {sessionModeLabel[session.mode]} · {session.durationMin} minutes
                          </p>
                          {session.preSession && (
                            <p className="mt-2 text-[0.75rem] text-forest-accent">Preparation submitted</p>
                          )}
                        </div>
                        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-ink-faint" aria-hidden="true" />
                      </div>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {held.length > 0 && (
        <section className="mt-8">
          <Eyebrow>Past sessions</Eyebrow>
          <ul className="mt-3 hairlines border-y border-sage-line">
            {held.map((session) => (
              <li key={session.id} className="flex items-center justify-between gap-3 py-3.5">
                <span className="text-[0.875rem] text-ink">{fullDate(session.startsAt.slice(0, 10))}</span>
                <span className="text-[0.8125rem] text-ink-soft">{sessionModeLabel[session.mode]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
