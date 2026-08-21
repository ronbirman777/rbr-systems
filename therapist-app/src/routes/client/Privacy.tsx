import { useParams } from 'react-router-dom';
import { Check, Eye, Lock, X } from 'lucide-react';
import { useEcosystem } from '@/state/EcosystemProvider';
import { practicesFor } from '@/services/selectors';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { PrivacyBadge } from '@/components/privacy/PrivacyBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { relativeDay, shortDate } from '@/utils/date';
import { plural } from '@/utils/format';

/**
 * Privacy is a first-class part of the client experience, not a settings page
 * buried three levels down. The distinction between "private to me" and
 * "shared with John" is stated in plain words and can be changed at any time.
 */
export default function ClientPrivacy() {
  const { clientId = 'emma' } = useParams();
  const { state, dispatch } = useEcosystem();
  const client = state.clients.find((c) => c.id === clientId) ?? state.clients[0];
  const therapistName = state.therapist.firstName;

  const reflections = practicesFor(state, client.id)
    .filter((p) => p.completion?.reflection)
    .reverse();

  const seen = [
    'That you completed a practice, and when',
    'Which practices you have been assigned',
    'Reflections you have chosen to share',
    'Messages you send in this app',
    'Session preparation answers',
  ];

  const notSeen = [
    'Reflections you keep private — the words themselves',
    'Anything you type but do not save',
    'Your location, your phone, or anything outside this app',
    'Notes you write for yourself elsewhere',
  ];

  return (
    <div className="animate-fade-in">
      <header className="flex items-center gap-4 pb-7">
        <Avatar person={client} size="xl" />
        <div className="min-w-0">
          <h1 className="editorial text-2xl leading-tight">
            {client.firstName} {client.lastName}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Working with {therapistName} since {shortDate(client.startedOn)} ·{' '}
            {plural(client.weeksTogether, 'week')}
          </p>
        </div>
      </header>

      <section className="rounded-4xl bg-forest-900 px-6 py-7 text-cream">
        <p className="text-2xs uppercase tracking-widest2 text-sage-400">Your privacy</p>
        <p className="editorial mt-2 text-2xl leading-snug">You decide what is shared</p>
        <p className="mt-3 text-sm leading-relaxed text-sage-300">
          Completing a practice and sharing what you wrote are two separate things. {therapistName} always
          sees the first. The second is always your choice.
        </p>
      </section>

      <section className="mt-8 grid gap-4">
        <div className="rounded-xl2 border border-sage-200 bg-white p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-forest-700">
            <Eye className="h-4 w-4" aria-hidden="true" />
            What {therapistName} can see
          </p>
          <ul className="mt-3 space-y-2">
            {seen.map((item) => (
              <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-ink">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-forest-600" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl2 border border-sage-200 bg-cream p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Lock className="h-4 w-4" aria-hidden="true" />
            What stays with you
          </p>
          <ul className="mt-3 space-y-2">
            {notSeen.map((item) => (
              <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-ink-muted">
                <X className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-9">
        <h2 className="editorial text-xl">Things you have written</h2>
        <p className="mt-1.5 text-sm text-ink-muted">
          You can change your mind about any of these, at any time.
        </p>

        <div className="mt-5 space-y-3">
          {reflections.length === 0 ? (
            <EmptyState title="Nothing written yet" description="Reflections you write will be listed here." />
          ) : (
            reflections.map((practice) => {
              const reflection = practice.completion!.reflection!;
              const shared = reflection.visibility === 'shared';
              return (
                <article key={practice.id} className="rounded-xl2 border border-sage-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-ink">{practice.title}</p>
                    <span className="text-2xs text-ink-faint">{relativeDay(practice.date)}</span>
                  </div>
                  <PrivacyBadge visibility={reflection.visibility} audience={therapistName} className="mt-2.5" />
                  <p className="mt-3 text-sm italic leading-relaxed text-ink">“{reflection.text}”</p>
                  <div className="mt-4">
                    <Button
                      size="sm"
                      variant={shared ? 'secondary' : 'quiet'}
                      onClick={() =>
                        dispatch({
                          type: 'reflection/set-visibility',
                          practiceId: practice.id,
                          visibility: shared ? 'private' : 'shared',
                        })
                      }
                      icon={shared ? <Lock className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    >
                      {shared ? 'Make private again' : `Share with ${therapistName}`}
                    </Button>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>

      <section className="mt-9 border-t border-sage-200/70 pt-7">
        <h2 className="editorial text-xl">About this demo</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          This is a demonstration application. Nothing you enter here leaves your browser, and no data is
          stored on a server. It makes no claim to any medical, clinical or regulatory certification.
        </p>
      </section>
    </div>
  );
}
