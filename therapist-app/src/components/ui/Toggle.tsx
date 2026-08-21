import { cn } from '@/utils/cn';

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-start gap-3 rounded-xl border border-sage-300 bg-white px-4 py-3 text-left transition hover:border-forest-600/60"
    >
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 inline-flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors',
          checked ? 'bg-forest-900' : 'bg-sage-300',
        )}
      >
        <span
          className={cn(
            'h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
            checked && 'translate-x-4',
          )}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-ink-muted">{description}</span>}
      </span>
    </button>
  );
}
