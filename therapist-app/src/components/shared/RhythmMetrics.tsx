import { cn } from '@/utils/cn';

/**
 * The client's own rhythm beside their recent rhythm.
 *
 * The comparison is always against the same person's learned baseline — there
 * is no cohort figure anywhere in this product, and no target to hit.
 */
export function RhythmMetrics({
  usual,
  recent,
  windowDays = 3,
  showWindow = false,
  size = 'md',
  className,
}: {
  usual: number;
  recent: number;
  windowDays?: number;
  /** The workspace names the window; the briefing card does not need to. */
  showWindow?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const shifted = recent < usual - 10;
  return (
    <dl className={cn('flex items-stretch', size === 'sm' ? 'gap-5' : 'gap-8', className)}>
      <div>
        <dt className="eyebrow">Usual Rhythm</dt>
        <dd
          className={cn(
            'mt-1.5 font-semibold tabular-nums text-ink',
            size === 'sm' ? 'text-xl' : 'text-[1.75rem] leading-none',
          )}
        >
          {Math.round(usual)}%
        </dd>
      </div>

      <div aria-hidden="true" className="w-px shrink-0 bg-sage-line" />

      <div>
        <dt className="eyebrow">
          Recent Rhythm{showWindow && <span> · Last {windowDays} Days</span>}
        </dt>
        <dd
          className={cn(
            'mt-1.5 font-semibold tabular-nums',
            shifted ? 'text-amber-deep' : 'text-forest-accent',
            size === 'sm' ? 'text-xl' : 'text-[1.75rem] leading-none',
          )}
        >
          {Math.round(recent)}%
        </dd>
      </div>
    </dl>
  );
}
