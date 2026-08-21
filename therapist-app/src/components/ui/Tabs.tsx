import { cn } from '@/utils/cn';

export interface TabItem<T extends string> {
  value: T;
  label: string;
  count?: number;
}

/** Horizontal, scrollable on small screens, keyboard reachable. */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className,
  size = 'md',
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div
      role="tablist"
      className={cn(
        'no-scrollbar -mx-1 flex gap-1 overflow-x-auto border-b border-sage-200/70 px-1',
        className,
      )}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cn(
              'relative whitespace-nowrap rounded-t-lg px-3 font-medium transition-colors',
              size === 'sm' ? 'py-2 text-xs' : 'py-3 text-sm',
              active ? 'text-forest-900' : 'text-ink-muted hover:text-forest-700',
            )}
          >
            {item.label}
            {item.count !== undefined && item.count > 0 && (
              <span className="ml-1.5 rounded-full bg-sage-200 px-1.5 py-0.5 text-2xs text-forest-700">
                {item.count}
              </span>
            )}
            <span
              aria-hidden="true"
              className={cn(
                'absolute inset-x-2 -bottom-px h-0.5 rounded-full transition-opacity',
                active ? 'bg-forest-900 opacity-100' : 'opacity-0',
              )}
            />
          </button>
        );
      })}
    </div>
  );
}

/** Pill filters used in directories and operational lists. */
export function FilterChips<T extends string>({
  items,
  value,
  onChange,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto pb-0.5">
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(item.value)}
            className={cn(
              'whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-medium transition',
              active
                ? 'border-forest-900 bg-forest-900 text-cream'
                : 'border-sage-300 bg-white text-ink-muted hover:border-forest-600/60 hover:text-forest-700',
            )}
          >
            {item.label}
            {item.count !== undefined && <span className="ml-1.5 opacity-70">{item.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
