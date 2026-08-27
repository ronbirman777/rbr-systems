import { useParams } from 'react-router-dom';
import { useApp } from '@/state/AppProvider';
import { chaptersFor } from '@/services/selectors';
import { EmptyState, Eyebrow } from '@/components/ui/Primitives';
import { cn } from '@/utils/cn';

const STATE_LABEL = { completed: 'Completed', 'in-progress': 'In Progress', upcoming: 'Upcoming' } as const;

/**
 * The client's own journey. The same chapters the practitioner sees, and none
 * of the analytics — no percentages, no rhythm, no scores.
 */
export default function ClientJourney() {
  const { clientId = 'emma' } = useParams();
  const { state } = useApp();
  const client = state.clients.find((c) => c.id === clientId) ?? state.clients[0];
  const chapters = chaptersFor(state, client.id);
  const current = chapters.find((c) => c.state === 'in-progress');

  return (
    <div className="animate-fade-in">
      <h1 className="font-display text-[1.875rem] leading-tight text-ink">Your Journey</h1>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-soft">
        The work you and {state.practitioner.name} have been doing, told in chapters.
      </p>

      {current && (
        <section className="mt-6 rounded-card bg-forest px-5 py-5 text-cream">
          <p className="text-2xs font-semibold uppercase tracking-eyebrow text-sage">Current Focus</p>
          <p className="mt-1.5 font-display text-[1.375rem] leading-snug">{current.title}</p>
          <p className="mt-2 text-[0.875rem] leading-relaxed text-sage-soft/90">{current.focus}</p>
        </section>
      )}

      {chapters.length === 0 && (
        <EmptyState
          className="mt-8"
          title="Your story starts with the first session"
          description="Chapters appear here as you and John work through them together."
        />
      )}

      <ol className="mt-8 space-y-9 border-l border-sage-line pl-6">
        {chapters.map((chapter) => (
          <li key={chapter.id} className="relative">
            <span
              aria-hidden="true"
              className={cn(
                'absolute -left-[1.8rem] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-ivory',
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
            <h2 className="font-display text-[1.375rem] leading-tight text-ink">{chapter.title}</h2>
            <p className="mt-1.5 text-[0.875rem] leading-relaxed text-ink-soft">{chapter.focus}</p>

            {chapter.milestones.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {chapter.milestones.map((milestone) => (
                  <li key={milestone} className="flex gap-2.5 text-[0.875rem] leading-relaxed text-ink">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-sage" aria-hidden="true" />
                    {milestone}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>

      <p className="mt-9 border-t border-sage-line pt-6 font-display text-[1.0625rem] italic leading-relaxed text-ink-soft">
        The next chapter is still being written.
      </p>
    </div>
  );
}
