import { Circle, Flag } from 'lucide-react';
import type { JourneyChapter } from '@/types';
import { shortDate } from '@/utils/date';
import { cn } from '@/utils/cn';

/**
 * Chapters, not levels. The journey is told as an editorial narrative — no
 * points, no badges, no progress bar to "complete".
 */
export function JourneyTimeline({
  chapters,
  compact = false,
}: {
  chapters: JourneyChapter[];
  compact?: boolean;
}) {
  return (
    <ol className="relative space-y-10 border-l border-sage-200 pl-6 sm:pl-8">
      {chapters.map((chapter, index) => (
        <li key={chapter.id} className="relative">
          <span
            className={cn(
              'absolute -left-[1.6rem] top-1.5 flex h-3 w-3 items-center justify-center rounded-full ring-4 ring-ivory sm:-left-[2.1rem]',
              chapter.current ? 'bg-forest-900' : 'bg-sage-300',
            )}
            aria-hidden="true"
          />
          <p className="eyebrow mb-2">
            Chapter {index + 1} · {chapter.weekTo ? `Weeks ${chapter.weekFrom}–${chapter.weekTo}` : `Week ${chapter.weekFrom} onward`}
            {chapter.current && ' · Current'}
          </p>
          <h3 className={cn('editorial leading-tight', compact ? 'text-xl' : 'text-2xl')}>{chapter.title}</h3>
          <p className="mt-1 text-sm text-ink-muted">{chapter.subtitle}</p>
          <p className="mt-3 max-w-2xl text-[0.95rem] leading-relaxed text-ink">{chapter.summary}</p>

          {chapter.practicesIntroduced.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-2xs uppercase tracking-widest2 text-ink-faint">Practices introduced</p>
              <div className="flex flex-wrap gap-2">
                {chapter.practicesIntroduced.map((practice) => (
                  <span key={practice} className="rounded-full bg-cream px-3 py-1 text-xs text-ink-muted">
                    {practice}
                  </span>
                ))}
              </div>
            </div>
          )}

          {chapter.milestones.length > 0 && (
            <ul className="mt-4 space-y-2">
              {chapter.milestones.map((milestone) => (
                <li key={milestone.id} className="flex items-center gap-2.5 text-sm text-ink">
                  <Flag className="h-3.5 w-3.5 shrink-0 text-forest-600" aria-hidden="true" />
                  {milestone.label}
                  <span className="text-2xs text-ink-faint">{shortDate(milestone.on)}</span>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
      <li className="relative">
        <span className="absolute -left-[1.6rem] top-1.5 text-sage-300 sm:-left-[2.1rem]" aria-hidden="true">
          <Circle className="h-3 w-3" />
        </span>
        <p className="text-sm italic text-ink-faint">The next chapter is still being written.</p>
      </li>
    </ol>
  );
}
