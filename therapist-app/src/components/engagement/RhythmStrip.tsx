import type { Practice } from '@/types';
import { practiceState } from '@/services/selectors';
import { weekdayShort, asDate, toISODate, DEMO_NOW } from '@/utils/date';
import { cn } from '@/utils/cn';

interface DayColumn {
  date: string;
  practices: Practice[];
}

/**
 * A rhythm strip rather than a chart: one column per day, one mark per assigned
 * practice. It reads as a pattern at a glance and never resolves into a score.
 */
export function RhythmStrip({
  days,
  className,
  showCounts = true,
}: {
  days: DayColumn[];
  className?: string;
  showCounts?: boolean;
}) {
  const today = toISODate(DEMO_NOW);

  return (
    <div className={cn('flex items-end gap-2 sm:gap-3', className)}>
      {days.map((day) => {
        const completed = day.practices.filter((p) => p.completion).length;
        const isToday = day.date === today;
        // A day that has not arrived yet has nothing to count.
        const isFuture = day.date > today;
        return (
          <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div className="flex w-full flex-col-reverse gap-1">
              {day.practices.length === 0 && (
                <span className="h-6 w-full rounded-md border border-dashed border-sage-200" />
              )}
              {day.practices.map((practice) => {
                const state = practiceState(practice);
                return (
                  <span
                    key={practice.id}
                    title={`${practice.title} · ${
                      state === 'completed' ? 'completed' : state === 'upcoming' ? 'later today' : 'not completed'
                    }`}
                    className={cn(
                      'h-5 w-full rounded-md transition-colors sm:h-6',
                      state === 'completed' && 'bg-forest-600',
                      state === 'due' && 'bg-amber-wash ring-1 ring-inset ring-[#EADCC2]',
                      state === 'missed' && 'bg-sage-200/70',
                      state === 'upcoming' && 'border border-dashed border-sage-300 bg-white',
                    )}
                  />
                );
              })}
            </div>
            <div className="text-center">
              <p
                className={cn(
                  'text-2xs font-semibold uppercase tracking-widest2',
                  isToday ? 'text-forest-900' : 'text-ink-faint',
                )}
              >
                {weekdayShort(asDate(day.date))}
              </p>
              {showCounts && (
                <p className="mt-0.5 text-2xs tabular-nums text-ink-muted">
                  {isFuture ? '—' : `${completed}/${day.practices.length}`}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function RhythmLegend() {
  const items = [
    { label: 'Completed', className: 'bg-forest-600' },
    { label: 'Still open today', className: 'bg-amber-wash ring-1 ring-inset ring-[#EADCC2]' },
    { label: 'Not completed', className: 'bg-sage-200/70' },
    { label: 'Later today', className: 'border border-dashed border-sage-300 bg-white' },
  ];
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-2xs text-ink-muted">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2">
          <span className={cn('h-3 w-3 rounded', item.className)} aria-hidden="true" />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
