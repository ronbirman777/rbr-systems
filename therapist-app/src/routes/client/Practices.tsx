import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useEcosystem } from '@/state/EcosystemProvider';
import { practicesFor, practiceState } from '@/services/selectors';
import { PracticeCard } from '@/components/client/PracticeCard';
import { Tabs } from '@/components/ui/Tabs';
import { EmptyState } from '@/components/ui/EmptyState';
import { relativeDay, todayISO } from '@/utils/date';

type Tab = 'today' | 'coming-up' | 'history';

export default function ClientPractices() {
  const { clientId = 'emma' } = useParams();
  const { state } = useEcosystem();
  const [tab, setTab] = useState<Tab>('today');

  const client = state.clients.find((c) => c.id === clientId) ?? state.clients[0];
  const base = `/client/${client.id}`;
  const today = todayISO();
  const all = useMemo(() => practicesFor(state, client.id), [state, client.id]);

  const list =
    tab === 'today'
      ? all.filter((p) => p.date === today)
      : tab === 'coming-up'
        ? all.filter((p) => p.date > today)
        : all.filter((p) => p.date < today).reverse();

  const grouped = useMemo(() => {
    const map = new Map<string, typeof list>();
    for (const practice of list) {
      const items = map.get(practice.date) ?? [];
      items.push(practice);
      map.set(practice.date, items);
    }
    return Array.from(map.entries());
  }, [list]);

  const doneToday = all.filter((p) => p.date === today && p.completion).length;
  const totalToday = all.filter((p) => p.date === today).length;

  return (
    <div className="animate-fade-in">
      <header className="pb-6">
        <h1 className="editorial text-[2rem] leading-tight">Practices</h1>
        <p className="mt-2 text-sm text-ink-muted">
          {doneToday} of {totalToday} done today. Nothing here is counted against you.
        </p>
      </header>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        size="sm"
        items={[
          { value: 'today', label: 'Today' },
          { value: 'coming-up', label: 'Coming up' },
          { value: 'history', label: 'History' },
        ]}
      />

      <div className="space-y-7 pt-6">
        {grouped.length === 0 ? (
          <EmptyState title="Nothing here" description="Practices will appear as they are assigned." />
        ) : (
          grouped.map(([date, items]) => (
            <section key={date}>
              {tab !== 'today' && <p className="eyebrow mb-3">{relativeDay(date)}</p>}
              <div className="space-y-2.5">
                {items.map((practice) => (
                  <PracticeCard key={practice.id} practice={practice} basePath={base} />
                ))}
              </div>
              {tab === 'history' && (
                <p className="mt-2 px-1 text-2xs text-ink-faint">
                  {items.filter((p) => p.completion).length} of {items.length} completed ·{' '}
                  {items.filter((p) => practiceState(p) === 'missed').length} not completed
                </p>
              )}
            </section>
          ))
        )}
      </div>
    </div>
  );
}
