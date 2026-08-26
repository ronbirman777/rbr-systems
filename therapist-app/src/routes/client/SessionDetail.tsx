import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, MapPin, Video } from 'lucide-react';
import { useApp } from '@/state/AppProvider';
import { hasFinished } from '@/services/selectors';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card, Eyebrow } from '@/components/ui/Primitives';
import { fullDate, clockTime } from '@/utils/date';
import { sessionModeLabel } from '@/utils/format';

export default function ClientSessionDetail() {
  const { clientId = 'emma', sessionId = '' } = useParams();
  const { state } = useApp();
  const client = state.clients.find((c) => c.id === clientId) ?? state.clients[0];
  const base = `/client/${client.id}`;
  const session = state.sessions.find((s) => s.id === sessionId && s.clientId === client.id);
  if (!session) return <Navigate to={`${base}/sessions`} replace />;

  const ModeIcon = session.mode === 'video' ? Video : MapPin;
  const past = hasFinished(session);

  return (
    <div className="animate-fade-in">
      <Link
        to={`${base}/sessions`}
        className="inline-flex items-center gap-1.5 text-[0.8125rem] text-ink-soft hover:text-forest"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Sessions
      </Link>

      <Eyebrow className="mt-5">{past ? 'Past session' : 'Upcoming session'}</Eyebrow>
      <h1 className="mt-1.5 font-display text-[1.75rem] leading-tight text-ink">
        {fullDate(session.startsAt.slice(0, 10))}
      </h1>
      <p className="mt-1.5 text-[0.9375rem] text-ink-soft">
        {clockTime(session.startsAt)} · {session.durationMin} minutes
      </p>

      <Card className="mt-6 p-4">
        <p className="flex items-center gap-2 text-[0.9375rem] text-ink">
          <ModeIcon className="h-4 w-4 shrink-0 text-sage" aria-hidden="true" />
          {sessionModeLabel[session.mode]} with {state.practitioner.name}
        </p>
      </Card>

      {!past && (
        <div className="mt-5 space-y-2.5">
          {session.mode === 'video' && (
            <Button variant="primary" size="lg" className="w-full" disabled>
              Join Session
              <span className="ml-2 text-2xs font-normal text-sage">Opens at {clockTime(session.startsAt)}</span>
            </Button>
          )}
          {session.preSession ? (
            <Card className="p-4">
              <p className="flex items-center gap-2 text-[0.875rem] text-forest-accent">
                <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                You have prepared for this session
              </p>
              <ButtonLink
                to={`${base}/sessions/${session.id}/prepare`}
                size="sm"
                className="mt-3"
                trailing={<ArrowRight className="h-3.5 w-3.5" />}
              >
                Review your answers
              </ButtonLink>
            </Card>
          ) : (
            <ButtonLink
              to={`${base}/sessions/${session.id}/prepare`}
              size="lg"
              className="w-full"
              trailing={<ArrowRight className="h-4 w-4" />}
            >
              Prepare for Session
            </ButtonLink>
          )}
        </div>
      )}

      {session.preSession && (
        <section className="mt-8">
          <Eyebrow>What you wrote</Eyebrow>
          <ul className="mt-3 space-y-4">
            {session.preSession.map((entry) => (
              <li key={entry.question}>
                <p className="text-[0.8125rem] text-ink-soft">{entry.question}</p>
                <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink">{entry.answer}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
