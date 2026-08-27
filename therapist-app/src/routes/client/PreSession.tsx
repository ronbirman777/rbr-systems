import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { useApp } from '@/state/AppProvider';
import { preSessionQuestions } from '@/data';
import { preparationsFor } from '@/services/selectors';
import { Button } from '@/components/ui/Button';
import { TextArea } from '@/components/ui/Field';
import { Eyebrow } from '@/components/ui/Primitives';
import { sessionWhen } from '@/utils/date';
import { cn } from '@/utils/cn';

/**
 * Three questions, one at a time. Unhurried on purpose — this is preparation
 * for a conversation, not a form to complete.
 */
export default function ClientPreSession() {
  const { clientId = 'emma', sessionId = '' } = useParams();
  const { state, dispatch } = useApp();
  const navigate = useNavigate();

  const client = state.clients.find((c) => c.id === clientId) ?? state.clients[0];
  const base = `/client/${client.id}`;
  const session = state.sessions.find((s) => s.id === sessionId && s.clientId === client.id);

  const attached = session ? preparationsFor(state, session.id).filter((p) => !p.completedAt) : [];
  // What John actually asked for, when he asked for something specific.
  const questions = attached.length > 0 ? attached.map((p) => p.prompt) : preSessionQuestions;

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>(() =>
    questions.map((_, i) => (attached.length > 0 ? '' : (session?.preSession?.[i]?.answer ?? ''))),
  );
  const [submitted, setSubmitted] = useState(false);

  if (!session) return <Navigate to={`${base}/sessions`} replace />;

  const last = step === questions.length - 1;

  if (submitted) {
    return (
      <div className="flex min-h-[60vh] animate-fade-in flex-col items-center justify-center text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-sage-soft text-forest animate-complete">
          <Check className="h-7 w-7" aria-hidden="true" />
        </span>
        <h1 className="mt-6 font-display text-[1.75rem] leading-tight text-ink">Thank you.</h1>
        <p className="mt-2 max-w-xs text-[0.9375rem] leading-relaxed text-ink-soft">
          {state.practitioner.name} will read this before {sessionWhen(session.startsAt).toLowerCase()}.
        </p>
        <Button variant="primary" className="mt-8" onClick={() => navigate(`${base}/today`)}>
          Back to today
        </Button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <Link
        to={`${base}/sessions/${session.id}`}
        className="inline-flex items-center gap-1.5 text-[0.8125rem] text-ink-soft hover:text-forest"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Session
      </Link>

      <Eyebrow className="mt-5">Preparing for {sessionWhen(session.startsAt)}</Eyebrow>

      <ol className="mt-4 flex gap-1.5" aria-label={`Question ${step + 1} of ${questions.length}`}>
        {questions.map((question, index) => (
          <li
            key={question}
            aria-current={index === step ? 'step' : undefined}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors',
              index <= step ? 'bg-forest' : 'bg-sage-soft',
            )}
          />
        ))}
      </ol>

      {attached.length > 0 && (
        <p className="mt-6 text-[0.8125rem] text-ink-soft">{attached[step]?.title}</p>
      )}
      <h1 className="mt-2 font-display text-[1.625rem] leading-snug text-ink">{questions[step]}</h1>

      <TextArea
        rows={7}
        className="mt-5"
        value={answers[step]}
        onChange={(e) => setAnswers((current) => current.map((a, i) => (i === step ? e.target.value : a)))}
        placeholder="Take as much or as little space as you need."
        aria-label={questions[step]}
      />

      <div className="mt-6 flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => (step === 0 ? navigate(-1) : setStep(step - 1))}>
          {step === 0 ? 'Cancel' : 'Back'}
        </Button>

        {last ? (
          <Button
            variant="primary"
            onClick={() => {
              if (attached.length > 0) {
                attached.forEach((preparation, i) =>
                  dispatch({
                    type: 'preparation/complete',
                    preparationId: preparation.id,
                    response: answers[i].trim() || 'Nothing to add today.',
                  }),
                );
              } else {
                dispatch({
                  type: 'session/pre-session',
                  sessionId: session.id,
                  answers: questions.map((question, i) => ({
                    question,
                    answer: answers[i].trim() || 'Nothing to add today.',
                  })),
                });
              }
              setSubmitted(true);
            }}
          >
            Send to {state.practitioner.name}
          </Button>
        ) : (
          <Button variant="primary" onClick={() => setStep(step + 1)} trailing={<ArrowRight className="h-4 w-4" />}>
            Next
          </Button>
        )}
      </div>

      <p className="mt-5 text-2xs leading-relaxed text-ink-faint">
        You can leave any question blank. {state.practitioner.name} sees these answers before your session.
      </p>
    </div>
  );
}
