import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

/**
 * The page opening from the reference: a small eyebrow, a display heading, a
 * quiet line of guidance, and the date sitting opposite.
 */
export function PageHeader({
  eyebrow,
  title,
  lede,
  aside,
  action,
  className,
}: {
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  aside?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex flex-wrap items-start justify-between gap-x-8 gap-y-3', className)}>
      <div className="min-w-0 max-w-2xl">
        <p className="eyebrow mb-2.5">{eyebrow}</p>
        <h1 className="font-display text-[2rem] leading-[1.1] text-ink sm:text-[2.25rem]">{title}</h1>
        {lede && <p className="mt-2 text-[0.9375rem] text-ink-soft">{lede}</p>}
        {action && <div className="mt-5 flex flex-wrap gap-2">{action}</div>}
      </div>
      {aside && <div className="shrink-0 pt-1 text-[0.9375rem] text-ink-soft">{aside}</div>}
    </header>
  );
}
