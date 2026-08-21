import { useMemo, useState } from 'react';
import { useEcosystem } from '@/state/EcosystemProvider';
import { PageHeader } from '@/components/ui/PageHeader';
import { FilterChips } from '@/components/ui/Tabs';
import { ResourceGrid } from '@/components/resources/ResourceGrid';
import { TextInput } from '@/components/ui/Field';
import { useAssign } from '@/components/layout/TherapistShell';
import { Search } from 'lucide-react';

export default function TherapistResources() {
  const { state } = useEcosystem();
  const { openAssign } = useAssign();
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');

  const categories = useMemo(() => {
    const set = new Map<string, number>();
    for (const resource of state.resources) {
      set.set(resource.category, (set.get(resource.category) ?? 0) + 1);
    }
    return Array.from(set.entries());
  }, [state.resources]);

  const visible = state.resources
    .filter((r) => category === 'all' || r.category === category)
    .filter((r) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return r.title.toLowerCase().includes(q) || r.summary.toLowerCase().includes(q);
    });

  return (
    <div className="animate-fade-in">
      <PageHeader
        eyebrow="Resources"
        title="A small, considered library"
        lede="Everything here was chosen for a reason. Preview it, then assign it to whoever it fits."
      />

      <div className="flex flex-col gap-4 pb-7 lg:flex-row lg:items-center lg:justify-between">
        <FilterChips
          value={category}
          onChange={setCategory}
          items={[
            { value: 'all', label: 'All', count: state.resources.length },
            ...categories.map(([name, count]) => ({ value: name, label: name, count })),
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
            placeholder="Search the library"
            aria-label="Search resources"
            className="pl-10"
          />
        </div>
      </div>

      <ResourceGrid resources={visible} onAssign={(resourceId) => openAssign({ resourceId })} />
    </div>
  );
}
