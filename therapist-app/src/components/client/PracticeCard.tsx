import { Link } from 'react-router-dom';
import { Check, ChevronRight, Clock3, Moon, Sun, Sunset } from 'lucide-react';
import type { Practice } from '@/types';
import { practiceState } from '@/services/selectors';
import { clockTime } from '@/utils/date';
import { cn } from '@/utils/cn';

const partIcon = { morning: Sun, midday: Sunset, evening: Moon };
const partLabel = { morning: 'Morning', midday: 'Midday', evening: 'Evening' };

export function PracticeCard({ practice, basePath }: { practice: Practice; basePath: string }) {
  const state = practiceState(practice);
  const Icon = partIcon[practice.partOfDay];
  const done = state === 'completed';

  return (
    <Link
      to={`${basePath}/practices/${practice.id}`}
      className={cn(
        'flex items-center gap-4 rounded-xl2 border px-4 py-4 transition',
        done ? 'border-sage-200 bg-sage-100/60' : 'border-sage-200 bg-white hover:border-forest-600/40',
      )}
    >
      <span
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
          done ? 'bg-forest-900 text-cream' : 'bg-cream text-forest-600',
        )}
      >
        {done ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
      </span>

      <div className="min-w-0 flex-1">
        <p className={cn('text-[0.95rem] font-medium leading-snug', done ? 'text-ink-muted' : 'text-ink')}>
          {practice.title}
        </p>
        <p className="mt-0.5 text-xs text-ink-faint">
          {partLabel[practice.partOfDay]} · {clockTime(practice.time)} · {practice.durationMin} min
        </p>
      </div>

      {state === 'due' && (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-wash px-2.5 py-1 text-2xs text-[#8A6224]">
          <Clock3 className="h-3 w-3" aria-hidden="true" />
          Ready
        </span>
      )}
      {done && <span className="shrink-0 text-2xs text-ink-faint">Done</span>}
      <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden="true" />
    </Link>
  );
}
