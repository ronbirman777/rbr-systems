import { ArrowDownRight, Check, CircleDot, Moon, Sparkles, Undo2 } from 'lucide-react';
import type { AttentionState, SessionPrepState } from '@/types';
import { attentionTone } from '@/services/baselineEngine';
import { attentionLabel, prepStateLabel } from '@/utils/format';
import { cn } from '@/utils/cn';

const badge =
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-[6px] px-2.5 py-1 text-2xs font-medium ring-1 ring-inset';

const stateIcon: Record<AttentionState, typeof Check> = {
  'on-track': Check,
  'change-detected': ArrowDownRight,
  'check-in-suggested': CircleDot,
  'recently-inactive': Moon,
  're-engaged': Undo2,
  'baseline-forming': Sparkles,
};

/**
 * A rhythm state. Always carries its label and an icon, so the state is never
 * communicated by colour alone (WCAG 2.1 AA, 1.4.1).
 */
export function StatusBadge({
  state,
  withIcon = true,
  className,
}: {
  state: AttentionState;
  withIcon?: boolean;
  className?: string;
}) {
  const Icon = stateIcon[state];
  return (
    <span className={cn(badge, attentionTone[state].chip, className)}>
      {withIcon && <Icon className="h-3 w-3" aria-hidden="true" />}
      {attentionLabel[state]}
    </span>
  );
}

const prepTone: Record<SessionPrepState, string> = {
  'prep-ready': 'bg-sage-wash text-forest-accent ring-sage-soft',
  'notes-to-review': 'bg-amber-wash text-amber-deep ring-amber-line',
  'reflection-available': 'bg-sage-wash text-forest-accent ring-sage-soft',
  'not-started': 'bg-cream text-ink-faint ring-sage-line',
};

export function PrepBadge({ state, className }: { state: SessionPrepState; className?: string }) {
  return <span className={cn(badge, prepTone[state], className)}>{prepStateLabel[state]}</span>;
}
