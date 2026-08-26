import { useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Circle } from 'lucide-react';
import type { Client } from '@/types';
import { useApp } from '@/state/AppProvider';
import { practiceState, practicesOn } from '@/services/selectors';
import { Eyebrow, EmptyState } from '@/components/ui/Primitives';
import { Button } from '@/components/ui/Button';
import { addDays, clockTime, fullDate, todayISO, toISODate } from '@/utils/date';
import { practiceTypeLabel } from '@/utils/format';
import { cn } from '@/utils/cn';

const STATE_LABEL = {
  completed: 'Completed',
  available: 'Not completed',
  later: 'Later today',
  'not-completed': 'Not completed',
  optional: 'Optional',
} as const;

/**
 * A day of practices, with the days around it reachable.
 *
 * The language is deliberately neutral: a practice is completed or it is not.
 * Nothing here is a failure, a target, or an adherence figure.
 */
export function DailyPracticesPanel({ client, onAssign }: { client: Client; onAssign: () => void }) {
  const { state } = useApp();
  const [date, setDate] = useState(todayISO());

  const practices = practicesOn(state, client.id, date);
  const completed = practices.filter((p) => p.completedAt).length;
  const isToday = date === todayISO();

  return (
    <div className="px-6 py-8 sm:px-10 lg:px-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-[1.625rem] leading-tight text-ink">{fullDate(date)}</h2>
          <p className="mt-1 text-[0.8125rem] text-ink-soft">
            {completed} of {practices.length} completed
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            onClick={() => setDate(toISODate(addDays(date, -1)))}
            aria-label="Previous day"
            className="w-10 px-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={() => setDate(todayISO())} disabled={isToday}>
            Today
          </Button>
          <Button
            size="sm"
            onClick={() => setDate(toISODate(addDays(date, 1)))}
            aria-label="Next day"
            className="w-10 px-0"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mt-7">
        {practices.length === 0 ? (
          <EmptyState title="Nothing assigned on this day" />
        ) : (
          <ul className="hairlines border-y border-sage-line">
            {practices.map((practice) => {
              const pState = practiceState(practice);
              const done = pState === 'completed';
              return (
                <li key={practice.id} className="flex items-start gap-4 py-4">
                  <span
                    className={cn(
                      'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                      done ? 'bg-forest text-cream' : 'border border-sage-line bg-cream text-ink-faint',
                    )}
                  >
                    {done ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3 w-3" />}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-[0.9375rem] font-medium leading-snug text-ink">{practice.title}</p>
                    <p className="mt-0.5 text-[0.8125rem] text-ink-soft">
                      {practiceTypeLabel[practice.type]} · {clockTime(practice.targetTime)} ·{' '}
                      {practice.durationMin} min
                    </p>
                  </div>

                  <span
                    className={cn(
                      'shrink-0 text-[0.8125rem]',
                      done ? 'text-forest-accent' : 'text-ink-faint',
                    )}
                  >
                    {done && practice.completedAt
                      ? `Completed ${clockTime(practice.completedAt)}`
                      : STATE_LABEL[pState]}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-2xs leading-relaxed text-ink-faint">
          Completion is recorded by {client.name} in the companion app. You can see that it happened and
          when — this view never marks a practice complete on their behalf.
        </p>
        <Button size="sm" onClick={onAssign}>
          Assign Practice
        </Button>
      </div>

      <Eyebrow className="mt-10 block">Previous days</Eyebrow>
      <ul className="mt-3 flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5, 6, 7].map((back) => {
          const day = toISODate(addDays(todayISO(), -back));
          const list = practicesOn(state, client.id, day);
          const done = list.filter((p) => p.completedAt).length;
          return (
            <li key={day}>
              <button
                type="button"
                onClick={() => setDate(day)}
                className={cn(
                  'min-h-[2.25rem] rounded-full border px-3 text-[0.8125rem] transition-colors',
                  day === date
                    ? 'border-forest bg-forest text-cream'
                    : 'border-sage-line bg-white text-ink-soft hover:border-sage',
                )}
              >
                {fullDate(day).split(',')[0]}
                <span className="ml-1.5 tabular-nums opacity-70">
                  {done}/{list.length}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
