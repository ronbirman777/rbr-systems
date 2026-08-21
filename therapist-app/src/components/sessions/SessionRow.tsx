import { ArrowRight, MonitorPlay, Phone, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Avatar } from '@/components/ui/Avatar';
import { Button, ButtonLink } from '@/components/ui/Button';
import { useEcosystem } from '@/state/EcosystemProvider';
import { prepProgress } from '@/services/selectors';
import { clockTime, relativeDay } from '@/utils/date';
import { sessionTypeLabel } from '@/utils/format';
import type { Session } from '@/types';
import { cn } from '@/utils/cn';

const typeIcon = { video: MonitorPlay, 'in-person': Users, phone: Phone };

export function SessionRow({
  session,
  onPrepare,
  showDay = false,
  compact = false,
}: {
  session: Session;
  onPrepare?: (sessionId: string) => void;
  showDay?: boolean;
  compact?: boolean;
}) {
  const { state } = useEcosystem();
  const client = state.clients.find((c) => c.id === session.clientId);
  const prep = prepProgress(session);
  const Icon = typeIcon[session.type];
  if (!client) return null;

  return (
    <div
      className={cn(
        'grid grid-cols-[auto,minmax(0,1fr)] items-center gap-x-4 gap-y-3 px-1 py-4',
        'sm:flex sm:flex-nowrap',
        compact && 'py-3',
      )}
    >
      <div className="w-20 shrink-0">
        <p className="editorial text-lg leading-none text-forest-900">{clockTime(session.startsAt)}</p>
        {showDay && <p className="mt-1 text-2xs uppercase tracking-widest2 text-ink-faint">{relativeDay(session.startsAt)}</p>}
      </div>

      <Link
        to={`/therapist/clients/${client.id}`}
        className="flex min-w-0 items-center gap-3 rounded-lg py-0.5 transition hover:opacity-80 sm:flex-1"
      >
        <Avatar person={client} size={compact ? 'sm' : 'md'} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">
            {client.firstName} {client.lastName}
          </p>
          <p className="truncate text-xs text-ink-muted">
            <Icon className="mr-1 inline h-3 w-3 align-[-1px]" aria-hidden="true" />
            {sessionTypeLabel[session.type]} · {session.durationMin} min
            {session.focus ? ` · ${session.focus}` : ''}
          </p>
        </div>
      </Link>

      <div className="hidden w-44 shrink-0 md:block">
        <p className="text-xs text-ink-muted">
          {prep.answered} of {prep.total} preparation prompts
        </p>
        <div className="mt-1.5 flex gap-1" aria-hidden="true">
          {session.prepPrompts.map((prompt) => (
            <span
              key={prompt.id}
              className={cn(
                'h-1 flex-1 rounded-full',
                prompt.answer ? 'bg-forest-600' : 'bg-sage-200',
              )}
            />
          ))}
        </div>
      </div>

      <div className="col-span-2 flex shrink-0 gap-2 sm:col-span-1">
        {onPrepare && (
          <Button size="sm" variant="secondary" onClick={() => onPrepare(session.id)}>
            Prepare
          </Button>
        )}
        <ButtonLink
          to={`/therapist/clients/${client.id}`}
          size="sm"
          variant="ghost"
          trailingIcon={<ArrowRight className="h-4 w-4" />}
        >
          Open
        </ButtonLink>
      </div>
    </div>
  );
}
