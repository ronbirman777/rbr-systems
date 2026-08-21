import {
  BookOpenCheck,
  CalendarCheck,
  CircleCheck,
  FileText,
  MessageCircle,
  MessageCircleReply,
  Quote,
  Send,
} from 'lucide-react';
import type { ActivityEvent, ActivityKind } from '@/types';
import { useEcosystem } from '@/state/EcosystemProvider';
import { Avatar } from '@/components/ui/Avatar';
import { timeAgo } from '@/utils/date';
import { cn } from '@/utils/cn';
import { Link } from 'react-router-dom';

const icons: Record<ActivityKind, typeof CircleCheck> = {
  'practice-completed': CircleCheck,
  'reflection-shared': Quote,
  'message-sent': Send,
  'message-received': MessageCircleReply,
  'check-in-sent': MessageCircle,
  'practice-assigned': FileText,
  'resource-opened': BookOpenCheck,
  'session-prep': FileText,
  'session-completed': CalendarCheck,
  'rhythm-change': CircleCheck,
};

/**
 * Recent Activity updates quietly. Completions do not raise notifications —
 * the point is that John can look when he chooses to, not that the product
 * keeps asking for his attention.
 */
export function ActivityStream({ events, showClient = true }: { events: ActivityEvent[]; showClient?: boolean }) {
  const { state } = useEcosystem();

  return (
    <ol className="space-y-0.5">
      {events.map((event) => {
        const Icon = icons[event.kind] ?? CircleCheck;
        const client = state.clients.find((c) => c.id === event.clientId);
        return (
          <li key={event.id}>
            <div className="group flex items-start gap-3.5 rounded-xl px-3 py-3 transition-colors hover:bg-cream/70">
              <span
                className={cn(
                  'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                  event.prominence === 'notable' ? 'bg-sage-200 text-forest-700' : 'bg-cream text-ink-faint',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug text-ink">
                  {showClient && client && (
                    <Link
                      to={`/therapist/clients/${client.id}`}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {client.firstName}
                    </Link>
                  )}
                  {showClient && client ? ' · ' : ''}
                  {event.label}
                </p>
                {event.detail && <p className="mt-0.5 truncate text-xs text-ink-muted">{event.detail}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-xs tabular-nums text-ink-faint">{timeAgo(event.at)}</span>
                {showClient && client && <Avatar person={client} size="xs" className="hidden sm:inline-flex" />}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
