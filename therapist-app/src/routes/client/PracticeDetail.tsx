import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Eye, Lock } from 'lucide-react';
import { useEcosystem } from '@/state/EcosystemProvider';
import { practiceState } from '@/services/selectors';
import { resourceById } from '@/data/mockResources';
import { AudioPlayer } from '@/components/client/AudioPlayer';
import { Button } from '@/components/ui/Button';
import { TextArea } from '@/components/ui/Field';
import { PrivacyBadge } from '@/components/privacy/PrivacyBadge';
import { Avatar } from '@/components/ui/Avatar';
import { clockTime, relativeDay } from '@/utils/date';
import { practiceTypeLabel } from '@/utils/format';
import type { ReflectionVisibility } from '@/types';
import { cn } from '@/utils/cn';

export default function ClientPracticeDetail() {
  const { clientId = 'emma', practiceId = '' } = useParams();
  const { state, dispatch } = useEcosystem();
  const navigate = useNavigate();

  const [reflection, setReflection] = useState('');
  const [visibility, setVisibility] = useState<ReflectionVisibility>('private');
  const [justCompleted, setJustCompleted] = useState(false);

  const client = state.clients.find((c) => c.id === clientId);
  const practice = state.practices.find((p) => p.id === practiceId);
  const base = `/client/${clientId}`;

  if (!client || !practice) return <Navigate to={`${base}/practices`} replace />;

  const status = practiceState(practice);
  const resource = resourceById(practice.resourceId);
  const done = status === 'completed';

  const complete = () => {
    dispatch({
      type: 'practice/complete',
      practiceId: practice.id,
      reflection: practice.invitesReflection && reflection.trim()
        ? { text: reflection.trim(), visibility }
        : undefined,
    });
    setJustCompleted(true);
  };

  /* ---------------------------------------------- gentle acknowledgement */
  if (justCompleted) {
    return (
      <div className="animate-fade-in flex min-h-[70vh] flex-col items-center justify-center text-center">
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-sage-200 text-forest-900">
          <Check className="h-9 w-9" aria-hidden="true" />
        </span>
        <h1 className="editorial mt-7 text-3xl leading-tight">Practice completed</h1>
        <p className="mt-3 max-w-xs text-base leading-relaxed text-ink-muted">
          You made space for yourself today.
        </p>
        {practice.invitesReflection && reflection.trim() && (
          <div className="mt-6">
            <PrivacyBadge visibility={visibility} audience={state.therapist.firstName} />
            <p className="mt-2 max-w-xs text-xs text-ink-faint">
              {visibility === 'private'
                ? `${state.therapist.firstName} can see that you completed this. What you wrote stays with you.`
                : `${state.therapist.firstName} will see what you wrote before your next session.`}
            </p>
          </div>
        )}
        <div className="mt-9 flex flex-col gap-2">
          <Button variant="primary" onClick={() => navigate(`${base}/today`)}>
            Back to today
          </Button>
          <Button variant="ghost" onClick={() => navigate(`${base}/practices`)}>
            See all practices
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <Link
        to={`${base}/practices`}
        className="mb-6 inline-flex items-center gap-2 text-sm text-ink-muted transition hover:text-forest-700"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Practices
      </Link>

      <p className="eyebrow mb-2">
        {practiceTypeLabel[practice.type]} · {relativeDay(practice.date)} at {clockTime(practice.time)}
      </p>
      <h1 className="editorial text-[1.85rem] leading-tight">{practice.title}</h1>
      <p className="mt-1.5 text-sm text-ink-faint">{practice.durationMin} minutes</p>

      {resource?.type === 'audio' && (
        <div className="mt-7">
          <AudioPlayer title={resource.title} durationMin={resource.durationMin} />
        </div>
      )}

      <section className="mt-7">
        <p className="text-[1.02rem] leading-relaxed text-ink">{practice.instructions}</p>
      </section>

      {resource && resource.type !== 'audio' && (
        <section className="mt-7 rounded-xl2 border border-sage-200 bg-white p-5">
          <p className="eyebrow mb-3">{resource.title}</p>
          <ol className="space-y-2.5">
            {resource.preview.map((line, index) => (
              <li key={line} className="flex gap-3 text-sm leading-relaxed text-ink">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cream text-2xs font-semibold text-forest-600">
                  {index + 1}
                </span>
                {line}
              </li>
            ))}
          </ol>
        </section>
      )}

      {practice.message && (
        <section className="mt-7 flex items-start gap-3 rounded-xl2 bg-cream px-4 py-4">
          <Avatar person={state.therapist} size="sm" />
          <div>
            <p className="text-2xs uppercase tracking-widest2 text-ink-faint">
              From {state.therapist.firstName}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-ink">{practice.message}</p>
          </div>
        </section>
      )}

      {practice.invitesReflection && !done && (
        <section className="mt-8">
          <p className="eyebrow mb-3">If you would like to write something</p>
          <TextArea
            rows={5}
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            placeholder="One line is a real answer."
            aria-label="Your reflection"
          />

          <fieldset className="mt-4">
            <legend className="mb-2 text-xs font-semibold uppercase tracking-widest2 text-ink-muted">
              Who can read this
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  {
                    value: 'private' as const,
                    label: 'Private to me',
                    hint: `${state.therapist.firstName} will not read this`,
                    icon: Lock,
                  },
                  {
                    value: 'shared' as const,
                    label: `Share with ${state.therapist.firstName}`,
                    hint: 'He will read it before your session',
                    icon: Eye,
                  },
                ]
              ).map((option) => {
                const Icon = option.icon;
                const active = visibility === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setVisibility(option.value)}
                    className={cn(
                      'rounded-xl border px-3.5 py-3 text-left transition',
                      active
                        ? 'border-forest-900 bg-forest-900 text-cream'
                        : 'border-sage-300 bg-white hover:border-forest-600/60',
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    <span className="mt-2 block text-sm font-medium">{option.label}</span>
                    <span className={cn('mt-0.5 block text-2xs', active ? 'text-sage-300' : 'text-ink-faint')}>
                      {option.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <p className="mt-3 text-xs leading-relaxed text-ink-faint">
            Either way, {state.therapist.firstName} sees that you completed this practice. Only the words are
            affected by this choice.
          </p>
        </section>
      )}

      {done ? (
        <section className="mt-9 rounded-xl2 bg-sage-100/70 px-5 py-5">
          <p className="flex items-center gap-2 text-sm font-medium text-forest-700">
            <Check className="h-4 w-4" aria-hidden="true" />
            Completed at {clockTime(practice.completion!.completedAt)}
          </p>
          {practice.completion?.reflection && (
            <div className="mt-4">
              <PrivacyBadge
                visibility={practice.completion.reflection.visibility}
                audience={state.therapist.firstName}
              />
              <p className="mt-2 text-sm italic leading-relaxed text-ink">
                “{practice.completion.reflection.text}”
              </p>
            </div>
          )}
        </section>
      ) : (
        <div className="mt-9 pb-4">
          <Button variant="primary" size="lg" className="w-full" onClick={complete} icon={<Check className="h-5 w-5" />}>
            Mark as completed
          </Button>
          <p className="mt-3 text-center text-xs text-ink-faint">
            Only you can mark this complete. {state.therapist.firstName} cannot do it for you.
          </p>
        </div>
      )}
    </div>
  );
}
