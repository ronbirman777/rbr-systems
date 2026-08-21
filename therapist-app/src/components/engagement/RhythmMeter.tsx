import { cn } from '@/utils/cn';
import type { ClientStatus } from '@/types';

/** Statuses where the recent pattern should read as settled rather than shifted. */
const SETTLED: ClientStatus[] = ['on-track', 're-engaged', 'new-client'];

/**
 * Usual rhythm and recent pattern shown side by side.
 *
 * The comparison is always against the client's own baseline — there is no
 * cohort average anywhere in this product, and no score.
 */
export function RhythmMeter({
  usual,
  recent,
  status,
  size = 'md',
  className,
}: {
  usual: number;
  recent: number;
  /** When given, the recent bar follows the reading rather than a local rule. */
  status?: ClientStatus;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const shifted = status ? !SETTLED.includes(status) : recent < usual - 15;
  const rows = [
    { label: 'Usual rhythm', value: usual, tone: 'bg-sage-400' },
    { label: 'Recent pattern', value: recent, tone: shifted ? 'bg-amber-soft' : 'bg-forest-600' },
  ];

  return (
    <dl className={cn('space-y-3', className)}>
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[auto,1fr,auto] items-center gap-3">
          <dt
            className={cn(
              'text-ink-muted',
              size === 'sm' ? 'w-24 text-2xs' : 'w-28 text-xs',
            )}
          >
            {row.label}
          </dt>
          <div className={cn('overflow-hidden rounded-full bg-sage-200/70', size === 'sm' ? 'h-1.5' : 'h-2')}>
            <div
              className={cn('h-full rounded-full transition-[width] duration-700 ease-out', row.tone)}
              style={{ width: `${Math.max(2, Math.min(100, row.value))}%` }}
            />
          </div>
          <dd
            className={cn(
              'tabular-nums font-medium text-forest-900',
              size === 'sm' ? 'w-9 text-xs' : 'w-11 text-sm',
            )}
          >
            {Math.round(row.value)}%
          </dd>
        </div>
      ))}
    </dl>
  );
}
