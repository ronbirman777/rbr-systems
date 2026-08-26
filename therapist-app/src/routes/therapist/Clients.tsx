import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Search } from 'lucide-react';
import type { AttentionState } from '@/types';
import { useApp } from '@/state/AppProvider';
import { allReadings, type ClientReading } from '@/services/selectors';
import { PageHeader } from '@/components/therapist/PageHeader';
import { Monogram } from '@/components/ui/Monogram';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TextInput } from '@/components/ui/Field';
import { EmptyState, Eyebrow } from '@/components/ui/Primitives';
import { sessionWhen, timeAgo } from '@/utils/date';
import { attentionLabel } from '@/utils/format';
import { cn } from '@/utils/cn';

type Filter = 'all' | AttentionState;

const FILTERS: Filter[] = [
  'all',
  'on-track',
  'change-detected',
  'check-in-suggested',
  'recently-inactive',
  're-engaged',
  'baseline-forming',
];

const filterLabel = (filter: Filter) => (filter === 'all' ? 'All' : attentionLabel[filter]);

/**
 * The directory. Open rows and hairlines rather than a table — the same people
 * a practitioner holds in mind, not a spreadsheet of records.
 */
export default function Clients() {
  const { state } = useApp();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const readings = useMemo(() => allReadings(state), [state]);

  const counts = useMemo(() => {
    const map = new Map<Filter, number>([['all', readings.length]]);
    for (const entry of readings) {
      map.set(entry.reading.state, (map.get(entry.reading.state) ?? 0) + 1);
    }
    return map;
  }, [readings]);

  const visible = readings
    .filter((entry) => filter === 'all' || entry.reading.state === filter)
    .filter((entry) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return entry.client.name.toLowerCase().includes(q) || entry.client.focus.toLowerCase().includes(q);
    })
    .sort((a, b) => b.reading.attentionWeight - a.reading.attentionWeight);

  return (
    <div className="animate-fade-in">
      <div className="border-b border-sage-line px-6 py-8 sm:px-10 lg:px-12">
        <PageHeader
          eyebrow="Clients"
          title="The people you are working with"
          lede={`${readings.length} active clients. Each one is read against their own rhythm, never against each other.`}
        />
      </div>

      <div className="px-6 py-7 sm:px-10 lg:px-12">
        <div className="flex flex-col gap-4 pb-6 xl:flex-row xl:items-center xl:justify-between">
          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
            {FILTERS.map((option) => {
              const active = option === filter;
              const count = counts.get(option) ?? 0;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(option)}
                  className={cn(
                    'min-h-[2.25rem] whitespace-nowrap rounded-full border px-3.5 text-[0.8125rem] font-medium transition-colors',
                    active
                      ? 'border-forest bg-forest text-cream'
                      : 'border-sage-line bg-white text-ink-soft hover:border-sage hover:text-ink',
                  )}
                >
                  {filterLabel(option)}
                  <span className={cn('ml-1.5 tabular-nums', active ? 'text-sage' : 'text-ink-faint')}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="relative xl:w-72">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
              aria-hidden="true"
            />
            <TextInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or focus"
              aria-label="Search clients"
              className="pl-9"
            />
          </div>
        </div>

        {visible.length === 0 ? (
          <EmptyState title="No clients in this view" description="Try another filter, or clear the search." />
        ) : (
          <>
            <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_1.5rem] gap-6 border-b border-sage-line pb-2.5 lg:grid">
              <Eyebrow>Client</Eyebrow>
              <Eyebrow>Rhythm State</Eyebrow>
              <Eyebrow>Last Activity</Eyebrow>
              <Eyebrow>Next Session</Eyebrow>
              <span />
            </div>

            <ul className="hairlines">
              {visible.map((entry) => (
                <ClientRow key={entry.client.id} entry={entry} />
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function ClientRow({ entry }: { entry: ClientReading }) {
  const { client, reading, nextSession } = entry;
  return (
    <li>
      <Link
        to={`/practitioner/clients/${client.id}`}
        className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-3 py-4 transition-colors hover:bg-cream/50 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_1.5rem]"
      >
        <div className="flex min-w-0 items-center gap-3.5">
          <Monogram person={client} size="md" />
          <div className="min-w-0">
            <p className="font-display text-lg leading-tight text-ink group-hover:text-forest">{client.name}</p>
            <p className="truncate text-[0.8125rem] text-ink-soft">Focus: {client.focus}</p>
          </div>
        </div>

        <div className="lg:order-none">
          <StatusBadge state={reading.state} />
        </div>

        <p className="col-span-2 text-[0.8125rem] text-ink-soft lg:col-span-1">
          <span className="lg:hidden">Last active </span>
          {timeAgo(client.lastActivityAt)}
        </p>

        <p className="col-span-2 text-[0.8125rem] text-ink-soft lg:col-span-1">
          {nextSession ? sessionWhen(nextSession.startsAt) : 'Not scheduled'}
        </p>

        <ChevronRight
          className="hidden h-4 w-4 text-ink-faint transition-transform group-hover:translate-x-0.5 lg:block"
          aria-hidden="true"
        />
      </Link>
    </li>
  );
}
