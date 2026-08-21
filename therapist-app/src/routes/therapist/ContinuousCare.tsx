import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useEcosystem } from '@/state/EcosystemProvider';
import { practiceState } from '@/services/selectors';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs, FilterChips } from '@/components/ui/Tabs';
import { Select } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { PracticeRow } from '@/components/practices/PracticeRow';
import { EmptyState } from '@/components/ui/EmptyState';
import { ActivityStream } from '@/components/therapist/ActivityStream';
import { Section } from '@/components/ui/Section';
import { useAssign } from '@/components/layout/TherapistShell';
import { daysBetween, relativeDay, todayISO } from '@/utils/date';
import { practiceTypeLabel } from '@/utils/format';
import type { PracticeType } from '@/types';

type View = 'today' | 'completed' | 'not-completed' | 'upcoming';

/**
 * The operational counterpart to Today. Today is the briefing; this is where
 * John works through the detail of what has been assigned across the practice.
 */
export default function ContinuousCare() {
  const { state } = useEcosystem();
  const { openAssign } = useAssign();
  const [view, setView] = useState<View>('today');
  const [clientFilter, setClientFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<PracticeType | 'all'>('all');

  const today = todayISO();

  /** Everything in the current view and client filter, before the type filter. */
  const viewPool = useMemo(() => {
    const withinRecent = (date: string) => {
      const delta = daysBetween(date);
      return delta >= 0 && delta <= 7;
    };
    return state.practices
      .filter((p) => (clientFilter === 'all' ? true : p.clientId === clientFilter))
      .filter((p) => {
        const status = practiceState(p);
        switch (view) {
          case 'today':
            return p.date === today;
          case 'completed':
            return Boolean(p.completion) && withinRecent(p.date);
          case 'not-completed':
            return status === 'missed' && withinRecent(p.date);
          case 'upcoming':
            return p.date > today;
          default:
            return true;
        }
      })
      .sort((a, b) => {
        const byDate = view === 'upcoming' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
        return byDate !== 0 ? byDate : a.time.localeCompare(b.time);
      });
  }, [state.practices, clientFilter, view, today]);

  const pool = useMemo(
    () => viewPool.filter((p) => (typeFilter === 'all' ? true : p.type === typeFilter)),
    [viewPool, typeFilter],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, typeof pool>();
    for (const practice of pool) {
      const list = map.get(practice.date) ?? [];
      list.push(practice);
      map.set(practice.date, list);
    }
    return Array.from(map.entries());
  }, [pool]);

  const types = useMemo(() => {
    const set = new Map<PracticeType, number>();
    for (const practice of viewPool) {
      set.set(practice.type, (set.get(practice.type) ?? 0) + 1);
    }
    return Array.from(set.entries()).sort((a, b) => b[1] - a[1]);
  }, [viewPool]);

  const counts = useMemo(() => {
    const all = state.practices;
    return {
      today: all.filter((p) => p.date === today).length,
      completed: all.filter((p) => p.completion && daysBetween(p.date) >= 0 && daysBetween(p.date) <= 7).length,
      notCompleted: all.filter((p) => practiceState(p) === 'missed' && daysBetween(p.date) <= 7).length,
      upcoming: all.filter((p) => p.date > today).length,
    };
  }, [state.practices, today]);

  return (
    <div className="animate-fade-in">
      <PageHeader
        eyebrow="Continuous care"
        title="Everything assigned, everywhere"
        lede="The operational view across the whole practice. Today stays the briefing; this is the detail behind it."
        action={
          <Button
            variant="primary"
            size="sm"
            onClick={() => openAssign()}
            icon={<Plus className="h-4 w-4" />}
            className="sm:hidden"
          >
            Assign activity
          </Button>
        }
      />

      <Tabs<View>
        value={view}
        onChange={setView}
        items={[
          { value: 'today', label: "Today's practices", count: counts.today },
          { value: 'completed', label: 'Recent completions', count: counts.completed },
          { value: 'not-completed', label: 'Not completed', count: counts.notCompleted },
          { value: 'upcoming', label: 'Upcoming', count: counts.upcoming },
        ]}
      />

      <div className="flex flex-col gap-3 py-6 lg:flex-row lg:items-center lg:justify-between">
        <FilterChips<PracticeType | 'all'>
          value={typeFilter}
          onChange={setTypeFilter}
          items={[
            { value: 'all', label: 'All types', count: viewPool.length },
            ...types.map(([type, count]) => ({ value: type, label: practiceTypeLabel[type], count })),
          ]}
        />
        <Select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          aria-label="Filter by client"
          className="lg:w-56"
        >
          <option value="all">All clients</option>
          {state.clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.firstName} {client.lastName}
            </option>
          ))}
        </Select>
      </div>

      {grouped.length === 0 ? (
        <EmptyState
          title="Nothing to show here"
          description="Try another view, or widen the filters."
          action={
            <Button variant="secondary" size="sm" onClick={() => { setClientFilter('all'); setTypeFilter('all'); }}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="space-y-8">
          {grouped.map(([date, items]) => (
            <div key={date}>
              <p className="eyebrow mb-3">{relativeDay(date)}</p>
              <div className="hairline-list rounded-xl2 border border-sage-200 bg-white px-4 sm:px-5">
                {items.map((practice) => (
                  <PracticeRow
                    key={practice.id}
                    practice={practice}
                    showClient
                    clientName={state.clients.find((c) => c.id === practice.clientId)?.firstName}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Section eyebrow="Practice-wide" title="Recent activity across all clients">
        <ActivityStream
          events={state.events
            .filter((e) => (clientFilter === 'all' ? true : e.clientId === clientFilter))
            .slice(0, 14)}
        />
      </Section>
    </div>
  );
}
