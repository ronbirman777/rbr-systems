import { Eye, Lock } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { ReflectionVisibility } from '@/types';

/**
 * The privacy boundary must be unmistakable wherever written content appears.
 * "Private" and "Shared" never look similar to each other.
 */
export function PrivacyBadge({
  visibility,
  audience = 'John',
  className,
}: {
  visibility: ReflectionVisibility;
  audience?: string;
  className?: string;
}) {
  const shared = visibility === 'shared';
  const Icon = shared ? Eye : Lock;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-2xs font-semibold uppercase tracking-widest2 ring-1',
        shared
          ? 'bg-sage-200 text-forest-700 ring-sage-300'
          : 'bg-white text-ink-muted ring-sage-300 [background-image:repeating-linear-gradient(135deg,rgba(146,169,156,0.16)_0_6px,transparent_6px_12px)]',
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {shared ? `Shared with ${audience}` : 'Private'}
    </span>
  );
}

export function PrivateNoteBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-forest-900 px-2.5 py-1 text-2xs font-semibold uppercase tracking-widest2 text-cream',
        className,
      )}
    >
      <Lock className="h-3 w-3" aria-hidden="true" />
      Private therapist note
    </span>
  );
}
