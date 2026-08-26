import type { Client } from '@/types';
import { useApp } from '@/state/AppProvider';
import { chaptersFor } from '@/services/selectors';
import { Eyebrow } from '@/components/ui/Primitives';
import { cn } from '@/utils/cn';

const STATE_LABEL = { completed: 'Completed', 'in-progress': 'In Progress', upcoming: 'Upcoming' } as const;

/** Narrative chapters. No levels, no percentages, nothing to unlock. */
export function JourneyPanel({ client }: { client: Client }) {
  const { state } = useApp();
  const chapters = chaptersFor(state, client.id);

  return (
    <div className="px-6 py-8 sm:px-10 lg:px-12">
      <h2 className="font-display text-[1.625rem] leading-tight text-ink">The journey so far</h2>
      <p className="mt-1.5 max-w-xl text-[0.9375rem] text-ink-soft">
        Chapters rather than milestones to hit. This is the same story {client.name} sees, told in their
        companion.
      </p>

      <ol className="mt-9 space-y-10 border-l border-sage-line pl-7">
        {chapters.map((chapter) => (
          <li key={chapter.id} className="relative">
            <span
              aria-hidden="true"
              className={cn(
                'absolute -left-[2.05rem] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-ivory',
                chapter.state === 'in-progress'
                  ? 'bg-forest'
                  : chapter.state === 'completed'
                    ? 'bg-sage'
                    : 'bg-sage-line',
              )}
            />
            <Eyebrow className="mb-1.5">
              Chapter {chapter.index} · {chapter.weeks} · {STATE_LABEL[chapter.state]}
            </Eyebrow>
            <h3 className="font-display text-2xl leading-tight text-ink">{chapter.title}</h3>
            <p className="mt-2 max-w-2xl text-[0.9375rem] leading-relaxed text-ink-soft">{chapter.focus}</p>

            {chapter.milestones.length > 0 && (
              <ul className="mt-4 space-y-2">
                {chapter.milestones.map((milestone) => (
                  <li key={milestone} className="flex gap-3 text-[0.875rem] text-ink">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-sage" aria-hidden="true" />
                    {milestone}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
