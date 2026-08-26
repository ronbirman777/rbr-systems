import { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { cn } from '@/utils/cn';

/**
 * A working player for a prototype with no recording behind it: the transport,
 * the clock and the scrubber all behave, so the shape of the practice is real
 * even though the audio is not. Nothing here claims a file is playing.
 */
export function AudioPlayer({
  durationMin,
  title,
  playing,
  onPlayingChange,
}: {
  durationMin: number;
  title: string;
  playing: boolean;
  onPlayingChange: (next: boolean) => void;
}) {
  const total = durationMin * 60;
  const [elapsed, setElapsed] = useState(0);
  const timer = useRef<number>();

  useEffect(() => {
    if (!playing) return;
    timer.current = window.setInterval(() => {
      setElapsed((current) => {
        if (current + 1 >= total) {
          onPlayingChange(false);
          return total;
        }
        return current + 1;
      });
    }, 1000);
    return () => window.clearInterval(timer.current);
  }, [playing, total, onPlayingChange]);

  const format = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${`${Math.round(seconds) % 60}`.padStart(2, '0')}`;

  return (
    <div>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => onPlayingChange(!playing)}
          aria-label={playing ? `Pause ${title}` : `Play ${title}`}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-forest text-cream transition-colors hover:bg-forest-accent"
        >
          {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
        </button>

        <div className="min-w-0 flex-1">
          <label htmlFor="scrubber" className="sr-only">
            Position in {title}
          </label>
          <input
            id="scrubber"
            type="range"
            min={0}
            max={total}
            value={Math.round(elapsed)}
            onChange={(e) => setElapsed(Number(e.target.value))}
            className={cn(
              'h-1.5 w-full cursor-pointer appearance-none rounded-full bg-sage-soft',
              '[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none',
              '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-forest',
              '[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full',
              '[&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-forest',
            )}
            style={{
              backgroundImage: `linear-gradient(to right, #285447 ${(elapsed / total) * 100}%, transparent 0)`,
            }}
          />
          <div className="mt-2 flex items-center justify-between text-2xs tabular-nums text-ink-soft">
            <span>{format(elapsed)}</span>
            <button
              type="button"
              onClick={() => {
                setElapsed(0);
                onPlayingChange(false);
              }}
              className="inline-flex items-center gap-1.5 rounded px-1 py-0.5 transition-colors hover:text-forest"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              Start again
            </button>
            <span>{format(total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
