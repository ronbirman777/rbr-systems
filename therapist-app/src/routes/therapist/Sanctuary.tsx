import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, ArchiveRestore, Copy, Pencil, Plus, Search, Share2 } from 'lucide-react';
import type { Resource, ResourceCategoryId } from '@/types';
import { useApp } from '@/state/AppProvider';
import { clientsUsing } from '@/services/selectors';
import { PageHeader } from '@/components/therapist/PageHeader';
import { ResourceFormDrawer } from '@/components/therapist/ResourceFormDrawer';
import { AssignResourceDrawer } from '@/components/therapist/AssignResourceDrawer';
import { formatIcon, formatLabel } from '@/components/shared/resourceMeta';
import { Button } from '@/components/ui/Button';
import { Monogram } from '@/components/ui/Monogram';
import { TextInput } from '@/components/ui/Field';
import { Card, EmptyState, IconTile } from '@/components/ui/Primitives';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/utils/cn';

type Filter = ResourceCategoryId | 'all' | 'archived';

/** The library: create it, curate it, and give pieces of it away. */
export default function Sanctuary() {
  const { state, dispatch } = useApp();
  const toast = useToast();

  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [formFor, setFormFor] = useState<Resource | 'new' | null>(null);
  const [assignFor, setAssignFor] = useState<string | null>(null);

  const active = useMemo(() => state.resources.filter((r) => r.status === 'active'), [state.resources]);
  const archived = useMemo(() => state.resources.filter((r) => r.status === 'archived'), [state.resources]);

  const visible = (filter === 'archived' ? archived : active)
    .filter((r) => filter === 'all' || filter === 'archived' || r.categoryId === filter)
    .filter((r) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        r.summary.toLowerCase().includes(q) ||
        r.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    });

  return (
    <div className="animate-fade-in">
      <div className="border-b border-sage-line px-6 py-8 sm:px-10 lg:px-12">
        <PageHeader
          eyebrow="Sanctuary"
          title="A small, considered library"
          lede="Everything here was chosen for a reason. Preview it, then send it to whoever it fits."
          action={
            <>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setFormFor('new')}
                icon={<Plus className="h-4 w-4" />}
              >
                Add Resource
              </Button>
              <Button size="sm" onClick={() => setAssignFor('')} icon={<Share2 className="h-4 w-4" />}>
                Assign to Client
              </Button>
            </>
          }
        />
      </div>

      <div className="px-6 py-7 sm:px-10 lg:px-12">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            <Chip active={filter === 'all'} onClick={() => setFilter('all')} count={active.length}>
              All
            </Chip>
            {state.resourceCategories.map((category) => {
              const count = active.filter((r) => r.categoryId === category.id).length;
              if (count === 0) return null;
              return (
                <Chip
                  key={category.id}
                  active={filter === category.id}
                  onClick={() => setFilter(category.id)}
                  count={count}
                >
                  {category.title}
                </Chip>
              );
            })}
            {archived.length > 0 && (
              <Chip active={filter === 'archived'} onClick={() => setFilter('archived')} count={archived.length}>
                Archived
              </Chip>
            )}
          </div>

          <div className="relative xl:w-72">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
              aria-hidden="true"
            />
            <TextInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, description or tag"
              aria-label="Search the Sanctuary"
              className="pl-9"
            />
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title={query ? 'Nothing matches that search' : 'Nothing in this category yet'}
              description={query ? 'Try another word, or clear the search.' : 'Add a resource to start it off.'}
            />
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((resource) => {
              const Icon = formatIcon[resource.format];
              const using = clientsUsing(state, resource.id);
              const isArchived = resource.status === 'archived';

              return (
                <Card key={resource.id} className={cn('flex flex-col p-5', isArchived && 'bg-cream/50')}>
                  <div className="flex items-start justify-between gap-3">
                    <IconTile>
                      <Icon className="h-[1.125rem] w-[1.125rem]" aria-hidden="true" />
                    </IconTile>
                    <span className="text-2xs uppercase tracking-eyebrow text-ink-faint">
                      {formatLabel[resource.format]} · {resource.durationMin} min
                    </span>
                  </div>

                  <h3 className="mt-4 font-display text-xl leading-tight text-ink">{resource.title}</h3>
                  <p className="mt-1.5 flex-1 text-[0.875rem] leading-relaxed text-ink-soft">
                    {resource.summary}
                  </p>

                  {resource.tags.length > 0 && (
                    <ul className="mt-3 flex flex-wrap gap-1.5">
                      {resource.tags.slice(0, 3).map((tag) => (
                        <li
                          key={tag}
                          className="rounded-full bg-sage-wash px-2.5 py-0.5 text-2xs text-forest-accent"
                        >
                          {tag}
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-3.5 flex items-center gap-2">
                    <div className="flex -space-x-1.5">
                      {using.slice(0, 3).map((client) => (
                        <Monogram key={client.id} person={client} size="xs" className="ring-2 ring-white" />
                      ))}
                    </div>
                    <span className="text-2xs text-ink-faint">
                      {using.length === 0 ? 'Not assigned' : `${using.length} using`}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-1.5">
                    <Link
                      to={`/practitioner/sanctuary/${resource.id}`}
                      className="inline-flex min-h-[2.25rem] items-center rounded-control border border-sage-line bg-white px-3.5 text-[0.8125rem] font-medium text-ink transition-colors hover:border-sage"
                    >
                      Preview
                    </Link>

                    {isArchived ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<ArchiveRestore className="h-4 w-4" />}
                        onClick={() => {
                          dispatch({ type: 'resource/restore', resourceId: resource.id });
                          toast(`${resource.title} restored`);
                        }}
                      >
                        Restore
                      </Button>
                    ) : (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setAssignFor(resource.id)}>
                          Assign
                        </Button>
                        <IconAction
                          label="Edit"
                          icon={<Pencil className="h-3.5 w-3.5" />}
                          onClick={() => setFormFor(resource)}
                        />
                        <IconAction
                          label="Duplicate"
                          icon={<Copy className="h-3.5 w-3.5" />}
                          onClick={() => {
                            dispatch({ type: 'resource/duplicate', resourceId: resource.id });
                            toast(`${resource.title} duplicated`);
                          }}
                        />
                        <IconAction
                          label="Archive"
                          icon={<Archive className="h-3.5 w-3.5" />}
                          onClick={() => {
                            dispatch({ type: 'resource/archive', resourceId: resource.id });
                            toast(`${resource.title} archived — nothing was deleted`);
                          }}
                        />
                      </>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <ResourceFormDrawer
        open={formFor !== null}
        onClose={() => setFormFor(null)}
        resource={formFor === 'new' ? undefined : (formFor ?? undefined)}
        onSaved={(_, assign) => assign && setAssignFor('')}
      />
      <AssignResourceDrawer
        open={assignFor !== null}
        onClose={() => setAssignFor(null)}
        resourceId={assignFor || undefined}
      />
    </div>
  );
}

function Chip({
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

function IconAction({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="tap-target rounded-control text-ink-faint transition-colors hover:bg-sage-wash hover:text-forest"
    >
      {icon}
    </button>
  );
}
