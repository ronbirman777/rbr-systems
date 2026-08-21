import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Search } from 'lucide-react';
import { useEcosystem } from '@/state/EcosystemProvider';
import { clientsWithReadings, type ClientWithReading } from '@/services/selectors';
import { attentionStatuses } from '@/services/engagementEngine';
import { PageHeader } from '@/components/ui/PageHeader';
import { FilterChips } from '@/components/ui/Tabs';
import { Avatar } from '@/components/ui/Avatar';
import { StatusPill } from '@/components/ui/StatusPill';
import { RhythmMeter } from '@/components/engagement/RhythmMeter';
import { EmptyState } from '@/components/ui/EmptyState';
import { TextInput } from '@/components/ui/Field';
import { timeAgo, whenLabel } from '@/utils/date';
import { plural } from '@/utils/format';

type Filter = 'all' | 'attention' | 'active' | 'upcoming' | 're-engaged';

const matches = (entry: ClientWithReading, filter: Filter): boolean => {
  switch (filter) {
    case 'attention':
      return attentionStatuses.includes(entry.reading.status);
    case 'active':
      return entry.client.quietDays === 0;
    case 'upcoming':
      return Boolean(entry.nextSession);
    case 're-engaged':
      return entry.reading.status === 're-engaged';
    default:
      return true;
  }
};

export default function ClientDirectory() {
  const { state } = useEcosystem();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const entries = useMemo(() => clientsWithReadings(state), [state]);

  const counts = useMemo(
    () => ({
      all: entries.length,
      attention: entries.filter((e) => matches(e, 'attention')).length,
      active: entries.filter((e) => matches(e, 'active')).length,
      upcoming: entries.filter((e) => matches(e, 'upcoming')).length,
      're-engaged': entries.filter((e) => matches(e, 're-engaged')).length,
    }),
    [entries],
  );

  const visible = entries
    .filter((entry) => matches(entry, filter))
    .filter((entry) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return (
        `${entry.client.firstName} ${entry.client.lastName}`.toLowerCase().includes(q) ||
        entry.client.focus.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => b.reading.attentionWeight - a.reading.attentionWeight);

  return (
    <div className="animate-fade-in">
      <PageHeader
        eyebrow="Clients"
        title="The people you are working with"
        lede="Nine active clients. Sorted by how far each one's recent pattern sits from their own usual rhythm."
      />

      <div className="flex flex-col gap-4 pb-6 lg:flex-row lg:items-center lg:justify-between">
        <FilterChips<Filter>
          value={filter}
          onChange={setFilter}
          items={[
            { value: 'all', label: 'All', count: counts.all },
            { value: 'attention', label: 'Needs attention', count: counts.attention },
            { value: 'active', label: 'Recently active', count: counts.active },
            { value: 'upcoming', label: 'Upcoming session', count: counts.upcoming },
            { value: 're-engaged', label: 'Re-engaged', count: counts['re-engaged'] },
          ]}
        />
        <div className="relative lg:w-72">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
            aria-hidden="true"
          />
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or focus"
            aria-label="Search clients"
            className="pl-10"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState title="No clients match this view" description="Try a different filter or clear the search." />
      ) : (
        <>
          {/* Desktop: a refined hybrid row, not an enterprise table */}
          <div className="hidden overflow-hidden rounded-xl2 border border-sage-200 bg-white lg:block">
            <div className="grid grid-cols-[minmax(0,2.1fr),minmax(0,1.3fr),minmax(0,1.5fr),auto] gap-6 border-b border-sage-200/70 bg-cream/60 px-6 py-3">
              {['Client', 'Next session', 'Engagement rhythm', ''].map((heading, i) => (
                <p key={heading || i} className="eyebrow">
                  {heading}
                </p>
              ))}
            </div>
            <div className="hairline-list">
              {visible.map((entry) => (
                <Link
                  key={entry.client.id}
                  to={`/therapist/clients/${entry.client.id}`}
                  className="group grid grid-cols-[minmax(0,2.1fr),minmax(0,1.3fr),minmax(0,1.5fr),auto] items-center gap-6 px-6 py-5 transition-colors hover:bg-cream/50"
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <Avatar person={entry.client} size="lg" />
                    <div className="min-w-0">
                      <p className="truncate text-[0.95rem] font-medium text-ink">
                        {entry.client.firstName} {entry.client.lastName}
                      </p>
                      <p className="truncate text-sm text-ink-muted">{entry.client.focus}</p>
                      <p className="mt-1 text-2xs text-ink-faint">
                        {plural(entry.client.weeksTogether, 'week')} together · last active{' '}
                        {timeAgo(entry.client.lastActiveAt).toLowerCase()}
                      </p>
                    </div>
                  </div>

                  <div className="min-w-0">
                    {entry.nextSession ? (
                      <>
                        <p className="truncate text-sm text-ink">{whenLabel(entry.nextSession.startsAt)}</p>
                        <p className="truncate text-xs text-ink-muted">{entry.nextSession.focus}</p>
                      </>
                    ) : (
                      <p className="text-sm text-ink-faint">Not scheduled</p>
                    )}
                  </div>

                  <div className="min-w-0">
                    <RhythmMeter usual={entry.reading.usualRhythm} recent={entry.reading.recentRhythm} status={entry.reading.status} size="sm" />
                  </div>

                  <div className="flex items-center gap-3">
                    <StatusPill status={entry.reading.status} size="sm" />
                    <ArrowRight className="h-4 w-4 text-ink-faint transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Tablet and mobile */}
          <div className="grid gap-3 sm:grid-cols-2 lg:hidden">
            {visible.map((entry) => (
              <Link
                key={entry.client.id}
                to={`/therapist/clients/${entry.client.id}`}
                className="rounded-xl2 border border-sage-200 bg-white p-4 transition hover:shadow-soft"
              >
                <div className="flex items-start gap-3.5">
                  <Avatar person={entry.client} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {entry.client.firstName} {entry.client.lastName}
                    </p>
                    <p className="truncate text-xs text-ink-muted">{entry.client.focus}</p>
                  </div>
                  <StatusPill status={entry.reading.status} size="sm" />
                </div>
                <div className="mt-4">
                  <RhythmMeter usual={entry.reading.usualRhythm} recent={entry.reading.recentRhythm} status={entry.reading.status} size="sm" />
                </div>
                <p className="mt-3 text-2xs text-ink-faint">
                  {entry.nextSession ? `Next · ${whenLabel(entry.nextSession.startsAt)}` : 'No session scheduled'}
                </p>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
