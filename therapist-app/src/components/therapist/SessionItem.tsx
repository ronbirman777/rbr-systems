import { Link } from 'react-router-dom';
import { MapPin, Video } from 'lucide-react';
import type { Session } from '@/types';
import { useApp } from '@/state/AppProvider';
import { PrepBadge } from '@/components/ui/StatusBadge';
import { clockTime, relativeDay } from '@/utils/date';
import { sessionModeLabel } from '@/utils/format';
import { hasFinished } from '@/services/selectors';
import { cn } from '@/utils/cn';

/** One session on the Today rail, or in an agenda. */
export function SessionItem({
  session,
  showDay = false,
  showFinished = false,
  className,
}: {
  session: Session;
  showDay?: boolean;
  /** Marks a session that has already happened. Off on the Today rail. */
  showFinished?: boolean;
  className?: string;
}) {
  const { state } = useApp();
  const client = state.clients.find((c) => c.id === session.clientId);
  const ModeIcon = session.mode === 'video' ? Video : MapPin;
  const finished = hasFinished(session);
  if (!client) return null;

  return (
    <Link
      to={`/practitioner/sessions/${session.id}`}
      className={cn(
        'group block py-4 transition-colors hover:bg-cream/50',
        showFinished && finished && 'opacity-70',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-2xs font-medium uppercase tracking-eyebrow text-ink-faint">
          {showDay && <span className="mr-1.5 text-ink-soft">{relativeDay(session.startsAt)}</span>}
          {clockTime(session.startsAt)}
        </p>
        <PrepBadge state={session.prepState} />
      </div>
      <p className="mt-1.5 font-display text-xl leading-tight text-ink group-hover:text-forest">{client.name}</p>
      <p className="mt-1 flex items-center gap-1.5 text-[0.8125rem] text-ink-soft">
        <ModeIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {sessionModeLabel[session.mode]} · {session.focus}
        {showFinished && finished && <span className="text-ink-faint">· Finished</span>}
      </p>
    </Link>
  );
}
