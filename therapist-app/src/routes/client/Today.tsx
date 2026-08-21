import { Link, useParams } from 'react-router-dom';
import { ArrowRight, CalendarClock, MessageCircle } from 'lucide-react';
import { useEcosystem } from '@/state/EcosystemProvider';
import {
  chaptersForClient,
  nextSessionFor,
  practicesOn,
  resourcesForClient,
  threadFor,
  unreadForClient,
} from '@/services/selectors';
import { PracticeCard } from '@/components/client/PracticeCard';
import { Avatar } from '@/components/ui/Avatar';
import { clockTime, greeting, longDate, relativeDay, todayISO } from '@/utils/date';
import { sessionTypeLabel } from '@/utils/format';

/**
 * The client's day. Not a task tracker — a personal space that happens to know
 * what today holds. No streaks, no scores, no pressure.
 */
export default function ClientToday() {
  const { clientId = 'emma' } = useParams();
  const { state } = useEcosystem();
  const client = state.clients.find((c) => c.id === clientId) ?? state.clients[0];
  const base = `/client/${client.id}`;

  const practices = practicesOn(state, client.id, todayISO());
  const completed = practices.filter((p) => p.completion).length;
  const session = nextSessionFor(state, client.id);
  const thread = threadFor(state, client.id);
  const unread = unreadForClient(state, client.id);
  const latest = thread?.messages[thread.messages.length - 1];
  const chapter = chaptersForClient(state, client.id).find((c) => c.current);
  const resources = resourcesForClient(state, client.id).slice(0, 2);

  return (
    <div className="animate-fade-in space-y-9">
      <header>
        <p className="eyebrow mb-2">{longDate()}</p>
        <h1 className="editorial text-[2rem] leading-[1.1]">
          {greeting()}, {client.preferredName}
        </h1>
      </header>

      <section className="rounded-4xl bg-forest-900 px-6 py-7 text-cream">
        <p className="text-2xs uppercase tracking-widest2 text-sage-400">Today's focus</p>
        <p className="editorial mt-2 text-2xl leading-snug">{client.todaysFocus}</p>
        <p className="mt-3 text-sm leading-relaxed text-sage-300">{client.focusDetail}</p>
      </section>

      {session && (
        <section>
          <p className="eyebrow mb-3">Next session with {state.therapist.firstName}</p>
          <div className="flex items-center gap-4 rounded-xl2 border border-sage-200 bg-white px-4 py-4">
            <Avatar person={state.therapist} size="md" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">
                {relativeDay(session.startsAt)} at {clockTime(session.startsAt)}
              </p>
              <p className="text-xs text-ink-muted">
                {sessionTypeLabel[session.type]} · {session.durationMin} minutes
              </p>
            </div>
            <CalendarClock className="h-5 w-5 shrink-0 text-sage-400" aria-hidden="true" />
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <p className="eyebrow">For today</p>
          <p className="text-2xs text-ink-faint">
            {completed} of {practices.length} done
          </p>
        </div>
        <div className="space-y-2.5">
          {practices.map((practice) => (
            <PracticeCard key={practice.id} practice={practice} basePath={base} />
          ))}
        </div>
        <Link
          to={`${base}/practices`}
          className="mt-3 inline-flex items-center gap-1.5 text-sm text-forest-700 underline-offset-4 hover:underline"
        >
          See all practices
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </section>

      {latest && latest.author === 'therapist' && (
        <section>
          <p className="eyebrow mb-3">From {state.therapist.firstName}</p>
          <Link
            to={`${base}/messages`}
            className="block rounded-xl2 border border-sage-200 bg-cream px-4 py-4 transition hover:border-forest-600/40"
          >
            <div className="flex items-start gap-3">
              <Avatar person={state.therapist} size="sm" />
              <div className="min-w-0">
                <p className="text-sm leading-relaxed text-ink">{latest.body}</p>
                <p className="mt-2 flex items-center gap-1.5 text-2xs text-ink-faint">
                  <MessageCircle className="h-3 w-3" aria-hidden="true" />
                  {unread > 0 ? 'New message' : 'Read'} · {relativeDay(latest.sentAt)}
                </p>
              </div>
            </div>
          </Link>
        </section>
      )}

      {chapter && (
        <section>
          <p className="eyebrow mb-3">Your journey</p>
          <Link
            to={`${base}/journey`}
            className="block rounded-xl2 border border-sage-200 bg-white px-5 py-5 transition hover:border-forest-600/40"
          >
            <p className="text-2xs uppercase tracking-widest2 text-ink-faint">
              Current chapter · Week {client.weeksTogether}
            </p>
            <p className="editorial mt-1.5 text-xl leading-tight">{chapter.title}</p>
            <p className="mt-1 text-sm text-ink-muted">{chapter.subtitle}</p>
          </Link>
        </section>
      )}

      {resources.length > 0 && (
        <section>
          <p className="eyebrow mb-3">Resources for you</p>
          <div className="space-y-2.5">
            {resources.map((resource) => (
              <Link
                key={resource.id}
                to={`${base}/resources`}
                className="flex items-center justify-between gap-4 rounded-xl2 border border-sage-200 bg-white px-4 py-3.5 transition hover:border-forest-600/40"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{resource.title}</p>
                  <p className="text-2xs text-ink-faint">
                    {resource.category} · {resource.durationMin} min
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="border-t border-sage-200/70 pt-8 pb-4">
        <p className="editorial text-lg italic leading-relaxed text-ink-muted">
          {client.closingReflection}
        </p>
      </section>
    </div>
  );
}
