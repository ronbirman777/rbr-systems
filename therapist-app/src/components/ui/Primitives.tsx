import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

/** A small uppercase label. The references use it above every block. */
export const Eyebrow = ({ children, className }: { children: ReactNode; className?: string }) => (
  <p className={cn('eyebrow', className)}>{children}</p>
);

/** The standard surface: white, one hairline, 12px radius, no shadow. */
export const Card = ({
  children,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'article' | 'section' | 'li';
}) => <Tag className={cn('card', className)}>{children}</Tag>;

/** A page-level block: eyebrow, display heading, optional action. */
export function Block({
  eyebrow,
  title,
  action,
  children,
  className,
}: {
  eyebrow?: string;
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      {(eyebrow || title || action) && (
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            {eyebrow && <Eyebrow className="mb-2">{eyebrow}</Eyebrow>}
            {title && <h2 className="font-display text-2xl leading-tight text-ink">{title}</h2>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-card border border-dashed border-sage-line bg-cream/40 px-6 py-9 text-center">
      <p className="font-display text-lg text-forest-accent">{title}</p>
      {description && <p className="mx-auto mt-1.5 max-w-sm text-[0.8125rem] text-ink-soft">{description}</p>}
    </div>
  );
}

/** A rounded icon tile, as drawn on the client resource cards. */
export const IconTile = ({
  children,
  className,
  size = 'md',
}: {
  children: ReactNode;
  className?: string;
  size?: 'sm' | 'md';
}) => (
  <span
    className={cn(
      'inline-flex items-center justify-center rounded-[10px] border border-sage-line bg-cream text-forest-accent',
      size === 'sm' ? 'h-9 w-9' : 'h-10 w-10',
      className,
    )}
  >
    {children}
  </span>
);
