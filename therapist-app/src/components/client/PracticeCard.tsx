import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import type { Practice } from '@/types';
import { useApp } from '@/state/AppProvider';
import { practiceState } from '@/services/selectors';
import { Button } from '@/components/ui/Button';
import { clockTime } from '@/utils/date';
import { practiceTypeLabel } from '@/utils/format';
import { cn } from '@/utils/cn';

/**
 * A practice in the client companion.
 *
 * There is no percentage, no streak and no overdue warning here — none of the
 * baseline intelligence crosses into this experience. A practice is either done
 * or it is waiting, and waiting is fine.
 */
export function PracticeCard({ practice, basePath }: { practice: Practice; basePath: string }) {
  const { dispatch } = useApp();
  const navigate = useNavigate();
  const state = practiceState(practice);
  const done = state === 'completed';

  const writes = practice.type === 'journal' || practice.type === 'reflection';
  const actionLabel = writes ? 'Open Prompt' : 'Mark Complete';

  const meta = [
    practiceTypeLabel[practice.type].toUpperCase(),
    practice.partOfDay === 'evening' || practice.partOfDay === 'night'
      ? practice.partOfDay.toUpperCase()
      : `${practice.durationMin} MIN`,
  ].join(' · ');

  return (
    <article
      className={cn(
        'relative rounded-card border p-4 transition-colors',
        done ? 'animate-complete border-sage-soft bg-sage-wash' : 'border-sage-line bg-white',
      )}
    >
      {done && (
        <span className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full bg-sage text-white">
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      )}

      <p className="text-3xs font-semibold uppercase tracking-eyebrow text-ink-faint">{meta}</p>

      <div className="mt-1.5 flex items-center justify-between gap-3">
        <h3 className={cn('text-[1.0625rem] font-semibold leading-snug', done ? 'text-ink-soft' : 'text-ink')}>
          {practice.title}
        </h3>

        {!done && (
          <Button
            size="sm"
            className="shrink-0"
            onClick={() => {
              if (writes) navigate(`${basePath}/practice/${practice.id}`);
              else dispatch({ type: 'practice/complete', practiceId: practice.id });
            }}
          >
            {actionLabel}
          </Button>
        )}
      </div>

      {done && practice.completedAt && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[0.8125rem] text-ink-soft">
          <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Completed {practice.completedAt.slice(11, 16)}
        </p>
      )}

      {!done && practice.optional && (
        <p className="mt-1.5 text-[0.8125rem] text-ink-faint">Optional — only if it helps today.</p>
      )}

      {!done && !practice.optional && state === 'later' && (
        <p className="mt-1.5 text-[0.8125rem] text-ink-faint">For {clockTime(practice.targetTime)}</p>
      )}

      <button
        type="button"
        onClick={() => navigate(`${basePath}/practice/${practice.id}`)}
        className="absolute inset-0 rounded-card"
        aria-label={`Open ${practice.title}`}
        tabIndex={-1}
        style={{ zIndex: -1 }}
      />
    </article>
  );
}
