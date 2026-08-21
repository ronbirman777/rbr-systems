import { ArrowDownRight, CircleDot, Leaf, Moon, Sparkles, Undo2 } from 'lucide-react';
import type { ClientStatus } from '@/types';
import { statusLabel, statusTone } from '@/services/engagementEngine';
import { cn } from '@/utils/cn';

const icons: Record<ClientStatus, typeof Leaf> = {
  'on-track': Leaf,
  'change-detected': ArrowDownRight,
  'check-in-suggested': CircleDot,
  'recently-inactive': Moon,
  're-engaged': Undo2,
  'new-client': Sparkles,
};

/**
 * Status always carries a label and an icon as well as a tone, so it is never
 * communicated by colour alone.
 */
export function StatusPill({
  status,
  size = 'md',
  className,
}: {
  status: ClientStatus;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const Icon = icons[status];
  const tone = statusTone[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full ring-1 font-medium whitespace-nowrap',
        tone.chip,
        size === 'sm' ? 'px-2.5 py-1 text-2xs' : 'px-3 py-1.5 text-xs',
        className,
      )}
    >
      <Icon className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} aria-hidden="true" />
      {statusLabel[status]}
    </span>
  );
}
