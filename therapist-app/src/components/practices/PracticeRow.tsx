import { Check, Clock3, Moon, Sun, Sunset } from 'lucide-react';
import type { Practice } from '@/types';
import { practiceState } from '@/services/selectors';
import { clockTime, relativeDay } from '@/utils/date';
import { practiceTypeLabel } from '@/utils/format';
import { PrivacyBadge } from '@/components/privacy/PrivacyBadge';
import { cn } from '@/utils/cn';

const partIcon = { morning: Sun, midday: Sunset, evening: Moon };

/**
 * How a practice appears in the therapist app.
 *
 * There is no checkbox here on purpose: completion belongs to the client app.
 * The therapist sees *that* it was completed and *when*, never a control that
 * would let them complete it on the client's behalf.
 */
export function PracticeRow({
  practice,
  showDate = false,
  showClient = false,
  clientName,
}: {
  practice: Practice;
  showDate?: boolean;
  /** Prefix the meta line with the client's name — for practice-wide lists. */
  showClient?: boolean;
  clientName?: string;
}) {
  const state = practiceState(practice);
  const Icon = partIcon[practice.partOfDay];
  const reflection = practice.completion?.reflection;

  return (
    <div className="flex items-start gap-4 px-1 py-4">
      <span
        className={cn(
          'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
          state === 'completed' ? 'bg-forest-900 text-cream' : 'bg-cream text-ink-faint',
        )}
      >
        {state === 'completed' ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <p className="text-sm font-medium text-ink">{practice.title}</p>
          <p className="text-2xs uppercase tracking-widest2 text-ink-faint">
            {practiceTypeLabel[practice.type]}
          </p>
        </div>
        <p className="mt-1 text-xs text-ink-muted">
          {showClient && clientName ? `${clientName} · ` : ''}
          {showDate ? `${relativeDay(practice.date)} · ` : ''}
          {clockTime(practice.time)} · {practice.durationMin} min
        </p>

        {state === 'completed' && practice.completion && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-sage-100 px-2.5 py-1 text-2xs text-forest-700">
            <Check className="h-3 w-3" aria-hidden="true" />
            Completed by {clientName ?? 'the client'} at {clockTime(practice.completion.completedAt)}
          </p>
        )}

        {reflection && (
          <div className="mt-3 rounded-xl border border-sage-200 bg-white px-3.5 py-3">
            <PrivacyBadge visibility={reflection.visibility} />
            {reflection.visibility === 'shared' ? (
              <p className="mt-2 text-sm italic leading-relaxed text-ink">“{reflection.text}”</p>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                A reflection was written and kept private. You can see that it happened; the words are not
                yours to read.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 pt-0.5">
        {state === 'missed' && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sage-100 px-2.5 py-1 text-2xs text-ink-muted">
            Not completed
          </span>
        )}
        {state === 'due' && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-wash px-2.5 py-1 text-2xs text-[#8A6224]">
            <Clock3 className="h-3 w-3" aria-hidden="true" />
            Open
          </span>
        )}
        {state === 'upcoming' && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-sage-300 px-2.5 py-1 text-2xs text-ink-faint">
            Later
          </span>
        )}
      </div>
    </div>
  );
}
