import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { cn } from '@/utils/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'onDark';
type Size = 'sm' | 'md' | 'lg';

/**
 * Button geometry follows the references: an 8px radius rather than a pill, a
 * solid deep-forest primary, and a white secondary carried by a sage hairline.
 */
const base =
  'relative inline-flex select-none items-center justify-center gap-2 rounded-control font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40';

const variants: Record<Variant, string> = {
  primary: 'bg-forest text-cream hover:bg-forest-accent active:bg-forest-deep',
  secondary: 'border border-sage-line bg-white text-ink hover:border-sage hover:bg-sage-wash/60',
  ghost: 'text-ink-soft hover:bg-sage-wash hover:text-forest',
  onDark: 'border border-white/25 bg-white/10 text-cream hover:bg-white/20',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-[0.8125rem]',
  md: 'h-10 px-5 text-sm',
  lg: 'h-12 px-6 text-[0.9375rem]',
};

interface Shared {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, Shared & ButtonHTMLAttributes<HTMLButtonElement>>(
  function Button({ variant = 'secondary', size = 'md', icon, trailing, className, children, ...rest }, ref) {
    return (
      <button ref={ref} className={cn(base, variants[variant], sizes[size], className)} {...rest}>
        {icon}
        {children}
        {trailing}
      </button>
    );
  },
);

export function ButtonLink({
  variant = 'secondary',
  size = 'md',
  icon,
  trailing,
  className,
  children,
  ...rest
}: Shared & LinkProps) {
  return (
    <Link className={cn(base, variants[variant], sizes[size], className)} {...rest}>
      {icon}
      {children}
      {trailing}
    </Link>
  );
}
