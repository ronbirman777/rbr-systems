import { CalendarClock, FileText, Lock, MessageCircle, Quote } from 'lucide-react';
import { Drawer } from '@/components/ui/Drawer';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { useEcosystem } from '@/state/EcosystemProvider';
import { buildSessionBrief } from '@/services/sessionBrief';
import { RhythmMeter } from '@/components/engagement/RhythmMeter';
import { readingFor } from '@/services/selectors';
import { clockTime, relativeDay, shortDate } from '@/utils/date';
import { sessionTypeLabel } from '@/utils/format';

/**
 * The pre-session brief: everything observable that happened between sessions,
 * in one screen, with no interpretation added.
 */
export function SessionBriefDrawer({
  sessionId,
  open,
  onClose,
}: {
  sessionId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const { state } = useEcosystem();
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session) return null;

  const brief = buildSessionBrief(state, session);
  const reading = readingFor(state, session.clientId);
  const { client } = brief;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      eyebrow="Session brief"
      title={`Prepare for ${client.firstName}`}
      description={`${relativeDay(session.startsAt)} at ${clockTime(session.startsAt)} · ${
        sessionTypeLabel[session.type]
      } · ${session.durationMin} minutes`}
      width="lg"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
          <ButtonLink to={`/therapist/clients/${client.id}`} variant="primary" size="sm" onClick={onClose}>
            Open {client.firstName}'s profile
          </ButtonLink>
        </div>
      }
    >
      <div className="space-y-8 pb-4">
        <div className="flex items-center gap-4 rounded-xl2 bg-cream px-4 py-4">
          <Avatar person={client} size="lg" />
          <div className="min-w-0">
            <p className="editorial text-xl leading-tight">
              {client.firstName} {client.lastName}
            </p>
            <p className="mt-0.5 text-sm text-ink-muted">{client.focus}</p>
          </div>
        </div>

        <section>
          <p className="eyebrow mb-3">{brief.sinceLabel}</p>
          <ul className="space-y-2.5">
            {brief.lines.map((line) => (
              <li key={line} className="flex gap-3 text-sm leading-relaxed text-ink">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-sage-400" aria-hidden="true" />
                {line}
              </li>
            ))}
          </ul>
          <p className="mt-4 rounded-xl bg-sage-100/70 px-4 py-3 text-xs leading-relaxed text-ink-muted">
            This brief reports observable activity only. It does not interpret how {client.firstName} is
            doing — that remains your work.
          </p>
        </section>

        <section>
          <p className="eyebrow mb-3">Engagement rhythm</p>
          <RhythmMeter usual={reading.usualRhythm} recent={reading.recentRhythm} status={reading.status} />
          <p className="mt-3 text-sm text-ink-muted">{reading.headline}</p>
        </section>

        {brief.byPractice.length > 0 && (
          <section>
            <p className="eyebrow mb-3">Practice by practice</p>
            <ul className="hairline-list overflow-hidden rounded-xl2 border border-sage-200 bg-white">
              {brief.byPractice.map((row) => (
                <li key={row.title} className="flex items-center justify-between gap-4 px-4 py-3">
                  <span className="min-w-0 truncate text-sm text-ink">{row.title}</span>
                  <span className="shrink-0 text-sm tabular-nums text-ink-muted">
                    {row.completed} of {row.due}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {brief.sharedReflections.length > 0 && (
          <section>
            <p className="eyebrow mb-3 flex items-center gap-1.5">
              <Quote className="h-3.5 w-3.5" aria-hidden="true" />
              Shared with you
            </p>
            <div className="space-y-3">
              {brief.sharedReflections.map((reflection) => (
                <blockquote
                  key={reflection.at}
                  className="rounded-xl2 border-l-2 border-forest-600 bg-cream px-4 py-3.5"
                >
                  <p className="text-sm italic leading-relaxed text-ink">“{reflection.text}”</p>
                  <footer className="mt-2 text-2xs text-ink-faint">
                    {reflection.title} · {shortDate(reflection.at)}
                  </footer>
                </blockquote>
              ))}
            </div>
          </section>
        )}

        {brief.privateReflectionCount > 0 && (
          <section className="flex items-start gap-3 rounded-xl2 border border-sage-200 bg-white px-4 py-3.5">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" aria-hidden="true" />
            <p className="text-sm text-ink-muted">
              {brief.privateReflectionCount === 1
                ? 'One further reflection was written and kept private.'
                : `${brief.privateReflectionCount} further reflections were written and kept private.`}{' '}
              You can see that they happened; the content is {client.firstName}'s.
            </p>
          </section>
        )}

        <section>
          <p className="eyebrow mb-3 flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            Session preparation
          </p>
          <ul className="space-y-3">
            {brief.prep.answers.map((prompt) => (
              <li key={prompt.text} className="rounded-xl2 border border-sage-200 bg-white px-4 py-3.5">
                <p className="text-sm font-medium text-ink">{prompt.text}</p>
                {prompt.answer ? (
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{prompt.answer}</p>
                ) : (
                  <p className="mt-1.5 text-sm text-ink-faint">Not answered yet.</p>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-ink-muted">
          <span className="flex items-center gap-1.5">
            <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
            {brief.messagesFromTherapist} from you · {brief.messagesFromClient} from {client.firstName}
          </span>
          {brief.since && (
            <span className="flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
              Last session {shortDate(brief.since.startsAt)}
            </span>
          )}
        </section>
      </div>
    </Drawer>
  );
}
