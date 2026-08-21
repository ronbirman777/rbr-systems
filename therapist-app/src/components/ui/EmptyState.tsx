import type { ReactNode } from 'react';

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl2 border border-dashed border-sage-300/80 bg-cream/50 px-6 py-10 text-center">
      <p className="editorial text-lg text-forest-700">{title}</p>
      {description && <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
