import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

/**
 * Sections carry the page rather than cards. Hierarchy comes from typography,
 * spacing and a hairline — not from boxing everything.
 */
export function Section({
  title,
  eyebrow,
  description,
  action,
  children,
  className,
  divider = true,
}: {
  title?: ReactNode;
  eyebrow?: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  divider?: boolean;
}) {
  return (
    <section className={cn('py-8 lg:py-10', divider && 'border-t border-sage-200/70', className)}>
      {(title || eyebrow || action) && (
        <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
            {title && <h2 className="editorial text-2xl lg:text-[1.75rem] leading-tight">{title}</h2>}
            {description && <p className="mt-2 max-w-xl text-sm text-ink-muted">{description}</p>}
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
