import { useId, type ReactNode, type SelectHTMLAttributes, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/utils/cn';

const control =
  'w-full rounded-xl border border-sage-300 bg-white px-4 py-3 text-sm text-ink placeholder:text-ink-faint transition focus:border-forest-600 focus:outline-none focus:ring-2 focus:ring-forest-600/20';

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
    <div className={cn('space-y-2', className)}>
      <label htmlFor={id} className="block text-xs font-semibold uppercase tracking-widest2 text-ink-muted">
        {label}
      </label>
      {children(id)}
      {hint && <p className="text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, className)} {...rest} />;
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, 'resize-none leading-relaxed', className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(control, 'appearance-none bg-no-repeat pr-10', className)} {...rest}>
      {children}
    </select>
  );
}

export function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  columns = 2,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (value: T) => void;
  columns?: 2 | 3;
}) {
  return (
    <fieldset>
      <legend className="mb-2 block text-xs font-semibold uppercase tracking-widest2 text-ink-muted">
        {label}
      </legend>
      <div className={cn('grid gap-2', columns === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              aria-pressed={active}
              className={cn(
                'rounded-xl border px-3 py-2.5 text-left text-sm transition',
                active
                  ? 'border-forest-600 bg-forest-900 text-cream'
                  : 'border-sage-300 bg-white text-ink hover:border-forest-600/60 hover:bg-sage-100',
              )}
            >
              <span className="block font-medium">{option.label}</span>
              {option.hint && (
                <span className={cn('block text-2xs', active ? 'text-sage-200' : 'text-ink-faint')}>
                  {option.hint}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
