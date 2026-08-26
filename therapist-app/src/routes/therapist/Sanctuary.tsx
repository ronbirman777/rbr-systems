import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Headphones, NotebookPen, Plus, Wind } from 'lucide-react';
import type { ResourceCategoryId, ResourceFormat } from '@/types';
import { useApp } from '@/state/AppProvider';
import { PageHeader } from '@/components/therapist/PageHeader';
import { AssignPracticeDrawer } from '@/components/therapist/AssignPracticeDrawer';
import { Button } from '@/components/ui/Button';
import { Monogram } from '@/components/ui/Monogram';
import { Card, EmptyState, IconTile } from '@/components/ui/Primitives';
import { resourceFormatLabel } from '@/utils/format';
import { cn } from '@/utils/cn';

const categoryIcon: Record<ResourceCategoryId, typeof Headphones> = {
  meditations: Headphones,
  breathwork: Wind,
  'journal-prompts': NotebookPen,
  reading: BookOpen,
};

const formatIcon: Record<ResourceFormat, typeof Headphones> = {
  audio: Headphones,
  prompt: NotebookPen,
  document: BookOpen,
};

/** The library: curated, previewable, and one step from being assigned. */
export default function Sanctuary() {
  const { state } = useApp();
  const [category, setCategory] = useState<ResourceCategoryId | 'all'>('all');
  const [assignFor, setAssignFor] = useState<string | null>(null);

  const visible =
    category === 'all' ? state.resources : state.resources.filter((r) => r.categoryId === category);

  return (
    <div className="animate-fade-in">
      <div className="border-b border-sage-line px-6 py-8 sm:px-10 lg:px-12">
        <PageHeader
          eyebrow="Sanctuary"
          title="A small, considered library"
          lede="Everything here was chosen for a reason. Preview it, then send it to whoever it fits."
        />
      </div>

      <div className="px-6 py-7 sm:px-10 lg:px-12">
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          <FilterChip active={category === 'all'} onClick={() => setCategory('all')} count={state.resources.length}>
            All
          </FilterChip>
          {state.resourceCategories.map((c) => (
            <FilterChip
              key={c.id}
              active={category === c.id}
              onClick={() => setCategory(c.id)}
              count={state.resources.filter((r) => r.categoryId === c.id).length}
            >
              {c.title}
            </FilterChip>
          ))}
        </div>

        {visible.length === 0 ? (
          <div className="mt-6">
            <EmptyState title="Nothing in this category yet" />
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((resource) => {
              const Icon = formatIcon[resource.format];
              const CategoryIcon = categoryIcon[resource.categoryId];
              const using = state.clients.filter((c) => resource.assignedTo.includes(c.id));
              return (
                <Card key={resource.id} className="flex flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <IconTile>
                      <Icon className="h-[1.125rem] w-[1.125rem]" aria-hidden="true" />
                    </IconTile>
                    <span className="inline-flex items-center gap-1.5 text-2xs uppercase tracking-eyebrow text-ink-faint">
                      <CategoryIcon className="h-3 w-3" aria-hidden="true" />
                      {resourceFormatLabel[resource.format]} · {resource.durationMin} min
                    </span>
                  </div>

                  <h3 className="mt-4 font-display text-xl leading-tight text-ink">{resource.title}</h3>
                  <p className="mt-1.5 flex-1 text-[0.875rem] leading-relaxed text-ink-soft">
                    {resource.summary}
                  </p>

                  <div className="mt-4 flex items-center gap-2">
                    <div className="flex -space-x-1.5">
                      {using.slice(0, 3).map((c) => (
                        <Monogram key={c.id} person={c} size="xs" className="ring-2 ring-white" />
                      ))}
                    </div>
                    <span className="text-2xs text-ink-faint">
                      {using.length === 0 ? 'Not assigned' : `${using.length} using`}
                    </span>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <Link
                      to={`/practitioner/sanctuary/${resource.id}`}
                      className="inline-flex min-h-[2.25rem] items-center rounded-control border border-sage-line bg-white px-3.5 text-[0.8125rem] font-medium text-ink transition-colors hover:border-sage"
                    >
                      Preview
                    </Link>
                    <Button size="sm" variant="ghost" onClick={() => setAssignFor(resource.id)} icon={<Plus className="h-4 w-4" />}>
                      Assign
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <AssignPracticeDrawer
        open={assignFor !== null}
        onClose={() => setAssignFor(null)}
        resourceId={assignFor ?? undefined}
      />
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'min-h-[2.25rem] whitespace-nowrap rounded-full border px-3.5 text-[0.8125rem] font-medium transition-colors',
        active
          ? 'border-forest bg-forest text-cream'
          : 'border-sage-line bg-white text-ink-soft hover:border-sage hover:text-ink',
      )}
    >
      {children}
      <span className={cn('ml-1.5 tabular-nums', active ? 'text-sage' : 'text-ink-faint')}>{count}</span>
    </button>
  );
}
