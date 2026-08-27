import { Link, useParams } from 'react-router-dom';
import { ArrowRight, CalendarPlus, MapPin, MessageCircle, Video } from 'lucide-react';
import { useApp } from '@/state/AppProvider';
import {
  nextSessionFor,
  openPreparationsFor,
  preparationProgress,
  requestsOf,
  todaysPractices,
  unreadForClient,
} from '@/services/selectors';
import { PracticeCard } from '@/components/client/PracticeCard';
import { ButtonLink } from '@/components/ui/Button';
import { Card, EmptyState, Eyebrow } from '@/components/ui/Primitives';
import { greeting, sessionWhen } from '@/utils/date';
import { sessionModeLabel } from '@/utils/format';

/**
 * The client's day. What is happening, what is waiting, and nothing that could
 * be read as a measure of how they are doing.
 */
export default function ClientToday() {
  const { clientId = 'emma' } = useParams();
  const { state } = useApp();
  const client = state.clients.find((c) => c.id === clientId) ?? state.clients[0];
  const base = `/client/${client.id}`;

  const practices = todaysPractices(state, client.id);
  const session = nextSessionFor(state, client.id);
  const prep = session ? preparationProgress(state, session.id) : { completed: 0, total: 0 };
  const waiting = openPreparationsFor(state, client.id);
  const unread = unreadForClient(state, client.id);
  const pending = requestsOf(state, client.id).find((r) => r.status === 'pending');
  const ModeIcon = session?.mode === 'in-person' ? MapPin : Video;

  return (
    <div className="animate-fade-in">
      <p className="font-display text-[0.9375rem] tracking-wide text-ink-soft">RBR</p>

      <h1 className="mt-5 font-display text-[1.875rem] leading-[1.15] text-ink">
        {greeting()},
        <br />
        {client.name}.
      </h1>

      {/* --------------------------------------------------- next session */}
      <section className="mt-7">
        <Eyebrow className="mb-2.5">{session ? 'Next Session' : 'Sessions'}</Eyebrow>

        {session ? (
          <Card className="p-4">
            <p className="text-[1.0625rem] font-semibold text-ink">{sessionWhen(session.startsAt)}</p>
            <p className="mt-1 flex items-center gap-1.5 text-[0.8125rem] text-ink-soft">
              <ModeIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {sessionModeLabel[session.mode]} Session with {state.practitioner.name}
            </p>
            {session.noteForClient && (
              <p className="mt-2.5 text-[0.8125rem] leading-relaxed text-ink">{session.noteForClient}</p>
            )}

            {prep.total > 0 && (
              <p className="mt-3 rounded-control bg-sage-wash px-3 py-2 text-[0.8125rem] text-forest-accent">
                Prepare for your session · {prep.completed} of {prep.total} completed
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <ButtonLink
                to={`${base}/sessions/${session.id}/prepare`}
                variant="primary"
                size="sm"
                trailing={<ArrowRight className="h-3.5 w-3.5" />}
              >
                {prep.total > 0 && prep.completed < prep.total ? 'Continue Preparation' : 'Prepare for Session'}
              </ButtonLink>
              <ButtonLink to={`${base}/sessions/${session.id}`} size="sm">
                View
              </ButtonLink>
            </div>
          </Card>
        ) : pending ? (
          <Card className="p-4">
            <p className="text-[1.0625rem] font-semibold text-ink">{sessionWhen(pending.startsAt)}</p>
            <p className="mt-1 text-[0.8125rem] text-ink-soft">
              Waiting for {state.practitioner.name} to confirm.
            </p>
            <ButtonLink to={`${base}/sessions`} size="sm" className="mt-3.5">
              View request
            </ButtonLink>
          </Card>
        ) : (
          <Card className="p-5 text-center">
            <p className="font-display text-[1.25rem] leading-snug text-ink">Book your next session</p>
            <p className="mx-auto mt-1.5 max-w-[16rem] text-[0.8125rem] leading-relaxed text-ink-soft">
              Choose a time that suits you from the hours {state.practitioner.name} has open.
            </p>
            <ButtonLink
              to={`${base}/book`}
              variant="primary"
              size="md"
              className="mt-4 w-full"
              icon={<CalendarPlus className="h-4 w-4" />}
            >
              View Available Times
            </ButtonLink>
          </Card>
        )}
      </section>

      {/* ------------------------------------------------------- practices */}
      <section className="mt-8">
        <Eyebrow>Today's Practices</Eyebrow>
        <p className="mt-1.5 text-[0.875rem] text-ink-soft">
          Your practices are here when you need them.
        </p>

        {practices.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="Nothing set for today"
              description={`Anything ${state.practitioner.name} assigns will appear here.`}
            />
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {practices.map((practice) => (
              <PracticeCard key={practice.id} practice={practice} basePath={base} />
            ))}
          </div>
        )}
      </section>

      {/* --------------------------------------------------- waiting on you */}
      {waiting.length > 0 && (
        <section className="mt-8">
          <Eyebrow className="mb-2.5">Before your session</Eyebrow>
          <ul className="space-y-2.5">
            {waiting.map((item) => (
              <li key={item.id}>
                <Link to={`${base}/sessions/${item.sessionId}/prepare`}>
                  <Card className="flex items-center justify-between gap-3 p-3.5 transition-colors hover:border-sage">
                    <span className="min-w-0">
                      <span className="block text-[0.875rem] font-medium text-ink">{item.title}</span>
                      <span className="mt-0.5 block truncate text-[0.75rem] text-ink-soft">{item.prompt}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden="true" />
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---------------------------------------------------------- message */}
      {unread > 0 && (
        <section className="mt-8">
          <Link to={`${base}/messages`}>
            <Card className="flex items-center gap-3 bg-cream/70 p-4 transition-colors hover:border-sage">
              <MessageCircle className="h-4 w-4 shrink-0 text-forest-accent" aria-hidden="true" />
              <span className="min-w-0 flex-1 text-[0.875rem] text-ink">
                {unread === 1 ? 'A new message' : `${unread} new messages`} from{' '}
                {state.practitioner.name}
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden="true" />
            </Card>
          </Link>
        </section>
      )}

      {session && (
        <div className="mt-8 text-center">
          <ButtonLink
            to={`${base}/book`}
            variant="ghost"
            size="sm"
            icon={<CalendarPlus className="h-4 w-4" />}
          >
            Book another session
          </ButtonLink>
        </div>
      )}
    </div>
  );
}
