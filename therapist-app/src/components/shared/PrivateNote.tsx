import { Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

/**
 * The practitioner-only boundary, drawn the same way everywhere it appears.
 *
 * Nothing wrapped in this component is reachable from any client route: the
 * client experience never imports the selectors that expose private notes,
 * private thoughts, or baseline readings.
 */
export function PrivateNote({
  label = 'Private Note',
  children,
  className,
}: {
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-card border border-dashed border-sage bg-sage-wash/40 p-4', className)}>
      <p className="mb-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-eyebrow text-forest-accent">
          <Lock className="h-3 w-3" aria-hidden="true" />
          {label}
        </span>
        <span className="text-2xs text-ink-faint">· Visible only to you</span>
      </p>
      {children}
    </div>
  );
}
