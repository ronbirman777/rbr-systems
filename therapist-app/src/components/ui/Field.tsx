import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/utils/cn';

const control =
  'w-full rounded-control border border-sage-line bg-white px-3.5 py-2.5 text-sm text-ink transition-colors placeholder:text-ink-faint focus:border-sage focus:outline-none focus:ring-2 focus:ring-forest-accent/15';

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  children: (id: string) => ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="eyebrow block">
        {label}
      </label>
      {children(id)}
      {hint && <p className="text-2xs leading-relaxed text-ink-faint">{hint}</p>}
    </div>
  );
}

export const TextInput = ({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) => (
  <input className={cn(control, className)} {...rest} />
);

export const TextArea = ({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea className={cn(control, 'resize-none leading-relaxed', className)} {...rest} />
);

export const Select = ({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select className={cn(control, 'appearance-none pr-9')} {...rest}>
    {children}
  </select>
);

/** A row of mutually exclusive choices, sized for a 44px touch target. */
export function ChoiceRow<T extends string>({
  label,
  value,
  options,
  onChange,
  columns = 3,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  columns?: 2 | 3 | 4;
}) {
  return (
    <fieldset>
      <legend className="eyebrow mb-1.5">{label}</legend>
      <div
        className={cn(
          'grid gap-1.5',
          columns === 2 && 'grid-cols-2',
          columns === 3 && 'grid-cols-3',
          columns === 4 && 'grid-cols-4',
        )}
      >
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={cn(
                'min-h-[2.75rem] rounded-control border px-2 text-[0.8125rem] font-medium transition-colors',
                active
                  ? 'border-forest bg-forest text-cream'
                  : 'border-sage-line bg-white text-ink-soft hover:border-sage hover:text-ink',
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Day-of-week picker, 0 = Sunday. */
export function DayPicker({ value, onChange }: { value: number[]; onChange: (days: number[]) => void }) {
  const labels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return (
    <fieldset>
      <legend className="eyebrow mb-1.5">Repeat days</legend>
      <div className="flex gap-1.5">
        {labels.map((label, day) => {
          const active = value.includes(day);
          return (
            <button
              key={names[day]}
              type="button"
              aria-pressed={active}
              aria-label={names[day]}
              onClick={() => onChange(active ? value.filter((d) => d !== day) : [...value, day].sort())}
              className={cn(
                'flex h-11 w-11 items-center justify-center rounded-full border text-[0.8125rem] font-medium transition-colors',
                active
                  ? 'border-forest bg-forest text-cream'
                  : 'border-sage-line bg-white text-ink-soft hover:border-sage',
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
