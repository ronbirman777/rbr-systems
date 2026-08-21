import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/utils/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'quiet';
type Size = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all duration-200 disabled:opacity-40 disabled:pointer-events-none select-none';

const variants: Record<Variant, string> = {
  primary: 'bg-forest-900 text-cream hover:bg-forest-700 active:bg-forest-deep shadow-soft',
  secondary: 'bg-white text-forest-900 border border-sage-300 hover:border-forest-600 hover:bg-sage-100',
  ghost: 'text-forest-700 hover:bg-sage-100',
  quiet: 'bg-sage-100 text-forest-700 hover:bg-sage-200',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-4 text-sm',
  md: 'h-11 px-5 text-sm',
  lg: 'h-12 px-6 text-base',
};

interface CommonProps {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  trailingIcon?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export const Button = forwardRef<
  HTMLButtonElement,
  CommonProps & ButtonHTMLAttributes<HTMLButtonElement>
>(function Button({ variant = 'secondary', size = 'md', icon, trailingIcon, className, children, ...rest }, ref) {
  return (
    <button ref={ref} className={cn(base, variants[variant], sizes[size], className)} {...rest}>
      {icon}
      {children}
      {trailingIcon}
    </button>
  );
});

export function ButtonLink({
  to,
  variant = 'secondary',
  size = 'md',
  icon,
  trailingIcon,
  className,
  children,
  ...rest
}: CommonProps & { to: string } & Omit<React.ComponentProps<typeof Link>, 'to' | 'className'>) {
  return (
    <Link to={to} className={cn(base, variants[variant], sizes[size], className)} {...rest}>
      {icon}
      {children}
      {trailingIcon}
    </Link>
  );
}
