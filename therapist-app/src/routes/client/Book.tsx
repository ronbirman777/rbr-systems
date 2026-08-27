import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, MapPin, Video } from 'lucide-react';
import { useApp } from '@/state/AppProvider';
import { bookableDates, bookableSlots } from '@/services/selectors';
import { Button } from '@/components/ui/Button';
import { TextArea } from '@/components/ui/Field';
import { Card, EmptyState, Eyebrow } from '@/components/ui/Primitives';
import { clockTime, fullDate, monthShort, sessionWhen, weekdayShort } from '@/utils/date';
import { sessionModeLabel } from '@/utils/format';
import type { SessionMode } from '@/types';
import { cn } from '@/utils/cn';

type Step = 'type' | 'date' | 'time' | 'review' | 'done';

const DURATION = 60;

/**
 * Booking, from the client's side.
 *
 * Emma sees times and nothing else. The list she is offered is what remains of
 * John's availability after his appointments, reserved slots and blocked time
 * are removed — she never learns that anything was removed, or why.
 */
export default function ClientBook() {
  const { clientId = 'emma' } = useParams();
  const { state, dispatch } = useApp();
  const navigate = useNavigate();

  const client = state.clients.find((c) => c.id === clientId) ?? state.clients[0];
  const base = `/client/${client.id}`;

  const [step, setStep] = useState<Step>('type');
  const [mode, setMode] = useState<SessionMode>('video');
  const [date, setDate] = useState<string | null>(null);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const dates = useMemo(() => bookableDates(state, 28, DURATION, client.id), [state, client.id]);
  const slots = useMemo(
    () => (date ? bookableSlots(state, date, DURATION, client.id) : []),
    [state, date, client.id],
  );

  const requiresApproval = state.bookingMode === 'request';

  if (step === 'done') {
    return (
      <div className="flex min-h-[60vh] animate-fade-in flex-col items-center justify-center text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-sage-soft text-forest animate-complete">
          <Check className="h-7 w-7" aria-hidden="true" />
        </span>
        <h1 className="mt-6 font-display text-[1.75rem] leading-tight text-ink">
          {requiresApproval ? 'Request sent.' : 'Your session is booked.'}
        </h1>
        <p className="mt-2 max-w-xs text-[0.9375rem] leading-relaxed text-ink-soft">
          {startsAt && sessionWhen(startsAt)}
          {requiresApproval
            ? `. ${state.practitioner.name} will confirm shortly — you will see it here once he does.`
            : `. It is in your sessions now.`}
        </p>
        <div className="mt-8 flex flex-col gap-2">
          <Button variant="primary" onClick={() => navigate(`${base}/sessions`)}>
            View my sessions
          </Button>
          <Button variant="ghost" onClick={() => navigate(`${base}/today`)}>
            Back to today
          </Button>
        </div>
      </div>
    );
  }

  const back = () => {
    if (step === 'type') navigate(-1);
    else if (step === 'date') setStep('type');
    else if (step === 'time') setStep('date');
    else setStep('time');
  };

  const stepIndex = ['type', 'date', 'time', 'review'].indexOf(step);

  return (
    <div className="animate-fade-in">
      <button
        type="button"
        onClick={back}
        className="inline-flex min-h-[2.25rem] items-center gap-1.5 text-[0.8125rem] text-ink-soft transition-colors hover:text-forest"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Back
      </button>

      <h1 className="mt-4 font-display text-[1.875rem] leading-tight text-ink">Book a Session</h1>
      <p className="mt-1.5 text-[0.9375rem] text-ink-soft">With {state.practitioner.name}.</p>

      <ol className="mt-5 flex gap-1.5" aria-label={`Step ${stepIndex + 1} of 4`}>
        {[0, 1, 2, 3].map((i) => (
          <li
            key={i}
            aria-current={i === stepIndex ? 'step' : undefined}
            className={cn('h-1 flex-1 rounded-full', i <= stepIndex ? 'bg-forest' : 'bg-sage-soft')}
          />
        ))}
      </ol>

      {step === 'type' && (
        <section className="mt-7">
          <Eyebrow className="mb-3">How would you like to meet?</Eyebrow>
          <div className="space-y-2.5">
            {(['video', 'in-person'] as SessionMode[]).map((option) => {
              const Icon = option === 'video' ? Video : MapPin;
              const active = mode === option;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setMode(option);
                    setStep('date');
                  }}
                  className={cn(
                    'flex w-full items-center gap-3.5 rounded-card border px-4 py-4 text-left transition-colors',
                    active ? 'border-forest bg-sage-wash' : 'border-sage-line bg-white hover:border-sage',
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0 text-forest-accent" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[1.0625rem] font-semibold text-ink">
                      {sessionModeLabel[option]}
                    </span>
                    <span className="block text-[0.8125rem] text-ink-soft">
                      {option === 'video' ? 'A link is sent before we meet' : 'At the practice'}
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </section>
      )}

      {step === 'date' && (
        <section className="mt-7">
          <Eyebrow className="mb-3">Choose a day</Eyebrow>
          {dates.length === 0 ? (
            <EmptyState
              title="No times are open just now"
              description={`${state.practitioner.name} has not opened new appointment times yet. Send him a message and he will find one.`}
            />
          ) : (
            <ul className="grid grid-cols-3 gap-2.5">
              {dates.map((option) => (
                <li key={option}>
                  <button
                    type="button"
                    onClick={() => {
                      setDate(option);
                      setStep('time');
                    }}
                    className={cn(
                      'flex min-h-[5rem] w-full flex-col items-center justify-center rounded-card border transition-colors',
                      date === option
                        ? 'border-forest bg-forest text-cream'
                        : 'border-sage-line bg-white text-ink hover:border-sage',
                    )}
                  >
                    <span className="text-2xs uppercase tracking-eyebrow opacity-70">
                      {weekdayShort(option)}
                    </span>
                    <span className="mt-0.5 font-display text-2xl leading-none">
                      {Number(option.slice(8))}
                    </span>
                    <span className="mt-0.5 text-2xs opacity-70">{monthShort(option)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {step === 'time' && date && (
        <section className="mt-7">
          <Eyebrow className="mb-1">{fullDate(date)}</Eyebrow>
          <p className="mb-3 text-[0.8125rem] text-ink-soft">Available times</p>
          {slots.length === 0 ? (
            <EmptyState title="Nothing open on this day" description="Try another day." />
          ) : (
            <ul className="grid grid-cols-2 gap-2.5">
              {slots.map((slot) => (
                <li key={slot.startsAt}>
                  <button
                    type="button"
                    onClick={() => {
                      setStartsAt(slot.startsAt);
                      setStep('review');
                    }}
                    className="min-h-[3.25rem] w-full rounded-card border border-sage-line bg-white text-[1.0625rem] font-medium text-ink transition-colors hover:border-forest hover:bg-sage-wash"
                  >
                    {clockTime(slot.startsAt)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {step === 'review' && startsAt && (
        <section className="mt-7">
          <Eyebrow className="mb-3">Review</Eyebrow>
          <Card className="p-5">
            <p className="font-display text-[1.375rem] leading-tight text-ink">
              Session with {state.practitioner.name}
            </p>
            <dl className="mt-4 space-y-2.5">
              {[
                ['When', sessionWhen(startsAt)],
                ['Length', `${DURATION} minutes`],
                ['Type', sessionModeLabel[mode]],
              ].map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-4">
                  <dt className="text-[0.8125rem] text-ink-soft">{label}</dt>
                  <dd className="text-[0.9375rem] text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <div className="mt-5">
            <Eyebrow className="mb-1.5">Anything to add?</Eyebrow>
            <TextArea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional — a line about what you would like to use the time for."
              aria-label="Note with your request"
            />
          </div>

          <Button
            variant="primary"
            size="lg"
            className="mt-6 w-full"
            onClick={() => {
              dispatch({
                type: 'booking/request',
                clientId: client.id,
                startsAt,
                durationMin: DURATION,
                mode,
                note: note.trim() || undefined,
              });
              setStep('done');
            }}
          >
            {requiresApproval ? 'Request this time' : 'Confirm Booking'}
          </Button>
          <p className="mt-3 text-center text-2xs leading-relaxed text-ink-faint">
            {requiresApproval
              ? `${state.practitioner.name} confirms each booking himself. You will see it here once he does.`
              : 'This time is held for you as soon as you confirm.'}
          </p>
        </section>
      )}

      <p className="mt-9 border-t border-sage-line pt-5 text-center text-2xs text-ink-faint">
        You only ever see times that are free.{' '}
        <Link to={`${base}/sessions`} className="underline underline-offset-2 hover:text-forest">
          Your sessions
        </Link>
      </p>
    </div>
  );
}
