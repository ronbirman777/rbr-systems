import { ArrowRight, MessageCirclePlus } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button, ButtonLink } from '@/components/ui/Button';
import { StatusPill } from '@/components/ui/StatusPill';
import { RhythmMeter } from '@/components/engagement/RhythmMeter';
import type { ClientWithReading } from '@/services/selectors';
import { timeAgo } from '@/utils/date';

/**
 * A client who may need attention today. Calm by design: no red, no alarm, no
 * score — a plain sentence about what changed and two ways to act on it.
 */
export function AttentionCard({
  entry,
  onCheckIn,
  emphasis = 'full',
}: {
  entry: ClientWithReading;
  onCheckIn: (clientId: string) => void;
  emphasis?: 'full' | 'compact';
}) {
  const { client, reading } = entry;

  if (emphasis === 'compact') {
    return (
      <div className="grid grid-cols-[auto,minmax(0,1fr)] items-center gap-x-3 gap-y-3 rounded-xl2 border border-sage-200 bg-white px-4 py-3.5 sm:flex sm:flex-wrap sm:gap-4">
        <Avatar person={client} size="sm" />
        <div className="min-w-0 sm:flex-1">
          <p className="truncate text-sm font-medium text-ink">
            {client.firstName} {client.lastName}
          </p>
          <p className="text-xs leading-snug text-ink-muted sm:truncate">{reading.headline}</p>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <StatusPill status={reading.status} size="sm" />
        </div>
        <div className="col-span-2 flex gap-2 sm:col-span-1">
          <ButtonLink to={`/therapist/clients/${client.id}`} size="sm" variant="ghost">
            View
          </ButtonLink>
          <Button size="sm" variant="secondary" onClick={() => onCheckIn(client.id)}>
            Check in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <article className="rounded-xl2 border border-sage-200 bg-white p-5 transition-shadow hover:shadow-soft sm:p-6">
      <div className="flex items-start gap-4">
        <Avatar person={client} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h3 className="editorial text-xl leading-tight">
              {client.firstName} {client.lastName}
            </h3>
            <StatusPill status={reading.status} size="sm" />
          </div>
          <p className="mt-1.5 text-sm text-ink-muted">
            {client.focus} · last active {timeAgo(client.lastActiveAt).toLowerCase()}
          </p>
          <p className="mt-3 text-base leading-relaxed text-ink">{reading.headline}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <RhythmMeter usual={reading.usualRhythm} recent={reading.recentRhythm} status={reading.status} />
        <ul className="space-y-1.5 text-sm text-ink-muted">
          {reading.observations.slice(0, 3).map((observation) => (
            <li key={observation} className="flex gap-2.5">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-sage-400" aria-hidden="true" />
              {observation}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <ButtonLink
          to={`/therapist/clients/${client.id}`}
          variant="primary"
          size="sm"
          trailingIcon={<ArrowRight className="h-4 w-4" />}
        >
          View {client.firstName}
        </ButtonLink>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onCheckIn(client.id)}
          icon={<MessageCirclePlus className="h-4 w-4" />}
        >
          Send check-in
        </Button>
      </div>
    </article>
  );
}
