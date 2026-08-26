import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { useApp } from '@/state/AppProvider';
import { practiceState } from '@/services/selectors';
import { AudioPlayer } from '@/components/client/AudioPlayer';
import { BreathingGuide } from '@/components/client/BreathingGuide';
import { Button } from '@/components/ui/Button';
import { TextArea } from '@/components/ui/Field';
import { Eyebrow } from '@/components/ui/Primitives';
import { clockTime } from '@/utils/date';
import { practiceTypeLabel } from '@/utils/format';

/** One practice, opened. Instructions, whatever it needs, and a way to finish. */
export default function ClientPractice() {
  const { clientId = 'emma', practiceId = '' } = useParams();
  const { state, dispatch } = useApp();
  const navigate = useNavigate();
  const [playing, setPlaying] = useState(false);
  const [written, setWritten] = useState('');
  const [justDone, setJustDone] = useState(false);

  const client = state.clients.find((c) => c.id === clientId) ?? state.clients[0];
  const base = `/client/${client.id}`;
  const practice = state.practices.find((p) => p.id === practiceId);
  if (!practice) return <Navigate to={`${base}/today`} replace />;

  const resource = state.resources.find((r) => r.id === practice.resourceId);
  const done = practiceState(practice) === 'completed';
  const writes = practice.type === 'journal' || practice.type === 'reflection';

  if (justDone) {
    return (
      <div className="flex min-h-[60vh] animate-fade-in flex-col items-center justify-center text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-sage-soft text-forest animate-complete">
          <Check className="h-7 w-7" aria-hidden="true" />
        </span>
        <h1 className="mt-6 font-display text-[1.75rem] leading-tight text-ink">That's done.</h1>
        <p className="mt-2 max-w-xs text-[0.9375rem] leading-relaxed text-ink-soft">
          You made a little space for yourself today.
        </p>
        <div className="mt-8 flex flex-col gap-2">
          <Button variant="primary" onClick={() => navigate(`${base}/today`)}>
            Back to today
          </Button>
        </div>
      </div>
    );
  }

  const complete = () => {
    if (writes && written.trim()) {
      dispatch({
        type: 'reflection/submit',
        clientId: client.id,
        title: practice.title,
        body: written.trim(),
        practiceId: practice.id,
      });
    } else {
      dispatch({ type: 'practice/complete', practiceId: practice.id });
    }
    setJustDone(true);
  };

  return (
    <div className="animate-fade-in">
      <Link
        to={`${base}/today`}
        className="inline-flex items-center gap-1.5 text-[0.8125rem] text-ink-soft hover:text-forest"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Today
      </Link>

      <Eyebrow className="mt-5">
        {practiceTypeLabel[practice.type]} · {clockTime(practice.targetTime)} · {practice.durationMin} min
      </Eyebrow>
      <h1 className="mt-1.5 font-display text-[1.75rem] leading-tight text-ink">{practice.title}</h1>

      {resource?.breathPattern && <BreathingGuide pattern={resource.breathPattern} running={playing} />}

      {resource?.format === 'audio' && (
        <div className="mt-6">
          <AudioPlayer
            durationMin={resource.durationMin}
            title={resource.title}
            playing={playing}
            onPlayingChange={setPlaying}
          />
        </div>
      )}

      <p className="mt-7 text-[1rem] leading-relaxed text-ink">{practice.instructions}</p>

      {resource && resource.format !== 'audio' && (
        <ol className="mt-6 space-y-3">
          {resource.body.map((line, index) => (
            <li key={line} className="flex gap-3 text-[0.9375rem] leading-relaxed text-ink">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cream text-3xs font-semibold text-forest-accent">
                {index + 1}
              </span>
              {line}
            </li>
          ))}
        </ol>
      )}

      {writes && !done && (
        <section className="mt-8">
          <Eyebrow className="mb-2">If you would like to write something</Eyebrow>
          <TextArea
            rows={6}
            value={written}
            onChange={(e) => setWritten(e.target.value)}
            placeholder="One line is a real answer."
            aria-label="Your reflection"
          />
          <p className="mt-2 text-2xs leading-relaxed text-ink-faint">
            What you write is shared with {state.practitioner.name} before your next session.
          </p>
        </section>
      )}

      {done ? (
        <p className="mt-8 flex items-center gap-2 rounded-card bg-sage-wash px-4 py-3.5 text-[0.875rem] text-forest">
          <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
          Completed {practice.completedAt ? clockTime(practice.completedAt) : ''}
        </p>
      ) : (
        <Button variant="primary" size="lg" className="mt-8 w-full" onClick={complete}>
          {writes && written.trim() ? 'Save and complete' : 'Mark Complete'}
        </Button>
      )}
    </div>
  );
}
