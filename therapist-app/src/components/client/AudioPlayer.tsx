import { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { cn } from '@/utils/cn';

/**
 * A guided-audio player for the demo. There is no audio file behind it — it
 * runs the session clock and the breathing motion so the experience of the
 * practice is real even though the recording is not.
 */
export function AudioPlayer({ title, durationMin }: { title: string; durationMin: number }) {
  const total = durationMin * 60;
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<number>();

  useEffect(() => {
    if (!playing) return;
    timer.current = window.setInterval(() => {
      setElapsed((current) => {
        if (current + 1 >= total) {
          setPlaying(false);
          return total;
        }
        return current + 1;
      });
    }, 1000);
    return () => window.clearInterval(timer.current);
  }, [playing, total]);

  const format = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${`${seconds % 60}`.padStart(2, '0')}`;

  return (
    <div className="rounded-4xl bg-forest-900 px-6 py-7 text-cream">
      <div className="relative mx-auto flex h-32 w-32 items-center justify-center">
        <span
          className={cn(
            'absolute inset-0 rounded-full bg-forest-600/70',
            playing ? 'animate-breathe' : 'opacity-50',
          )}
          aria-hidden="true"
        />
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          className="relative flex h-16 w-16 items-center justify-center rounded-full bg-cream text-forest-900 transition hover:scale-105"
          aria-label={playing ? `Pause ${title}` : `Play ${title}`}
        >
          {playing ? <Pause className="h-6 w-6" /> : <Play className="ml-0.5 h-6 w-6" />}
        </button>
      </div>

      <div className="mt-6">
        <div className="h-1 overflow-hidden rounded-full bg-forest-600">
          <div
            className="h-full rounded-full bg-sage-300 transition-all duration-1000 ease-linear"
            style={{ width: `${(elapsed / total) * 100}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-2xs tabular-nums text-sage-300">
          <span>{format(elapsed)}</span>
          <button
            type="button"
            onClick={() => {
              setElapsed(0);
              setPlaying(false);
            }}
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 transition hover:text-cream"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            Start again
          </button>
          <span>{format(total)}</span>
        </div>
      </div>
    </div>
  );
}
