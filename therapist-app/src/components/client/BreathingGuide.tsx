import { useEffect, useRef, useState } from 'react';
import { cn } from '@/utils/cn';

type Phase = 'inhale' | 'hold' | 'exhale';

/**
 * A paced breathing circle for breathwork resources.
 *
 * It expands, holds and contracts on the resource's own pattern. Motion is
 * driven by CSS transitions so `prefers-reduced-motion` disables it and the
 * written cue still carries the practice.
 */
export function BreathingGuide({
  pattern,
  running,
}: {
  pattern: { inhale: number; hold: number; exhale: number };
  running: boolean;
}) {
  const [phase, setPhase] = useState<Phase>('inhale');
  const [remaining, setRemaining] = useState(pattern.inhale);
  const timer = useRef<number>();

  useEffect(() => {
    if (!running) return;
    timer.current = window.setInterval(() => {
      setRemaining((current) => {
        if (current > 1) return current - 1;
        setPhase((currentPhase) => {
          const next: Phase =
            currentPhase === 'inhale'
              ? pattern.hold > 0
                ? 'hold'
                : 'exhale'
              : currentPhase === 'hold'
                ? 'exhale'
                : 'inhale';
          setRemaining(pattern[next]);
          return next;
        });
        return 0;
      });
    }, 1000);
    return () => window.clearInterval(timer.current);
  }, [running, pattern]);

  useEffect(() => {
    if (!running) {
      setPhase('inhale');
      setRemaining(pattern.inhale);
    }
  }, [running, pattern.inhale]);

  const label = phase === 'inhale' ? 'Breathe in' : phase === 'hold' ? 'Hold' : 'Breathe out';
  const scale = !running ? 0.78 : phase === 'inhale' ? 1 : phase === 'hold' ? 1 : 0.72;
  const duration = !running ? 600 : pattern[phase] * 1000;

  return (
    <div className="flex flex-col items-center py-8">
      <div className="relative flex h-40 w-40 items-center justify-center">
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-sage-soft"
          style={{
            transform: `scale(${scale})`,
            transitionProperty: 'transform',
            transitionDuration: `${duration}ms`,
            transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
        <span
          aria-hidden="true"
          className="absolute inset-6 rounded-full border border-sage/40"
          style={{
            transform: `scale(${scale})`,
            transitionProperty: 'transform',
            transitionDuration: `${duration}ms`,
          }}
        />
        <div className="relative text-center" aria-live="polite">
          <p className={cn('font-display text-xl leading-none', running ? 'text-forest' : 'text-ink-soft')}>
            {running ? label : 'Ready'}
          </p>
          {running && <p className="mt-1.5 text-2xs tabular-nums text-ink-soft">{remaining || pattern[phase]}</p>}
        </div>
      </div>
      <p className="mt-4 text-[0.8125rem] text-ink-soft">
        In {pattern.inhale}
        {pattern.hold > 0 ? ` · hold ${pattern.hold}` : ''} · out {pattern.exhale}
      </p>
    </div>
  );
}
