import { Link, useParams } from 'react-router-dom';
import { ArrowRight, Video } from 'lucide-react';
import { useApp } from '@/state/AppProvider';
import { nextSessionFor, todaysPractices } from '@/services/selectors';
import { PracticeCard } from '@/components/client/PracticeCard';
import { Card, Eyebrow } from '@/components/ui/Primitives';
import { greeting, sessionWhen } from '@/utils/date';
import { sessionModeLabel } from '@/utils/format';

/**
 * The client's day. Intentionally plain: what is happening today, and nothing
 * that could be read as a measure of how they are doing.
 */
export default function ClientToday() {
  const { clientId = 'emma' } = useParams();
  const { state } = useApp();
  const client = state.clients.find((c) => c.id === clientId) ?? state.clients[0];
  const base = `/client/${client.id}`;

  const practices = todaysPractices(state, client.id);
  const session = nextSessionFor(state, client.id);

  return (
    <div className="animate-fade-in">
      <p className="font-display text-[0.9375rem] tracking-wide text-ink-soft">RBR</p>

      <h1 className="mt-5 font-display text-[1.875rem] leading-[1.15] text-ink">
        {greeting()},
        <br />
        {client.name}.
      </h1>

      {session && (
        <Card className="mt-7 p-4">
          <Eyebrow>Upcoming Session</Eyebrow>
          <p className="mt-2 text-[1.0625rem] font-semibold text-ink">{sessionWhen(session.startsAt)}</p>
          <p className="mt-1 flex items-center gap-1.5 text-[0.8125rem] text-ink-soft">
            <Video className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {sessionModeLabel[session.mode]} Session with {state.practitioner.name}
          </p>
          <Link
            to={`${base}/sessions/${session.id}/prepare`}
            className="mt-3.5 inline-flex items-center gap-1.5 text-[0.875rem] font-medium text-ink hover:text-forest"
          >
            Prepare for Session
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </Card>
      )}

      <section className="mt-8">
        <Eyebrow>Today's Practices</Eyebrow>
        <p className="mt-1.5 text-[0.875rem] text-ink-soft">
          Your practices are here when you need them.
        </p>

        <div className="mt-4 space-y-3">
          {practices.map((practice) => (
            <PracticeCard key={practice.id} practice={practice} basePath={base} />
          ))}
        </div>
      </section>
    </div>
  );
}
