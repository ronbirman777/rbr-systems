import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

export function PageHeader({
  eyebrow,
  title,
  lede,
  meta,
  action,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  lede?: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-6 pb-8', className)}>
      <div className="min-w-0 max-w-2xl">
        {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
        <h1 className="editorial text-[2rem] leading-[1.1] sm:text-[2.6rem]">{title}</h1>
        {lede && <p className="mt-3 text-base leading-relaxed text-ink-muted">{lede}</p>}
        {meta && <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-muted">{meta}</div>}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </header>
  );
}
