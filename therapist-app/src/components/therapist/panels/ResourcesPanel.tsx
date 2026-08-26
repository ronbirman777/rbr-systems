import { Link } from 'react-router-dom';
import { BookOpen, Headphones, NotebookPen } from 'lucide-react';
import type { Client, ResourceFormat } from '@/types';
import { useApp } from '@/state/AppProvider';
import { resourcesFor } from '@/services/selectors';
import { Button } from '@/components/ui/Button';
import { Card, EmptyState, IconTile } from '@/components/ui/Primitives';
import { resourceFormatLabel } from '@/utils/format';

const formatIcon: Record<ResourceFormat, typeof Headphones> = {
  audio: Headphones,
  prompt: NotebookPen,
  document: BookOpen,
};

/** What this client already has, and a way to send them something else. */
export function ResourcesPanel({ client, onAssign }: { client: Client; onAssign: () => void }) {
  const { state } = useApp();
  const shared = resourcesFor(state, client.id);
  const others = state.resources.filter((r) => !shared.some((s) => s.id === r.id));

  return (
    <div className="px-6 py-8 sm:px-10 lg:px-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-[1.625rem] leading-tight text-ink">Shared with {client.name}</h2>
          <p className="mt-1.5 text-[0.9375rem] text-ink-soft">
            These appear in {client.name}’s Resources tab.
          </p>
        </div>
        <Button size="sm" onClick={onAssign}>
          Assign Practice
        </Button>
      </div>

      {shared.length === 0 ? (
        <EmptyState title="Nothing shared yet" />
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shared.map((resource) => {
            const Icon = formatIcon[resource.format];
            return (
              <Card key={resource.id} className="flex flex-col p-4">
                <div className="flex items-start justify-between gap-3">
                  <IconTile>
                    <Icon className="h-[1.125rem] w-[1.125rem]" aria-hidden="true" />
                  </IconTile>
                  <span className="text-2xs uppercase tracking-eyebrow text-ink-faint">
                    {resourceFormatLabel[resource.format]} · {resource.durationMin} min
                  </span>
                </div>
                <h3 className="mt-3.5 text-[0.9375rem] font-medium leading-snug text-ink">{resource.title}</h3>
                <p className="mt-1 flex-1 text-[0.8125rem] leading-relaxed text-ink-soft">{resource.summary}</p>
                <Link
                  to={`/practitioner/sanctuary/${resource.id}`}
                  className="mt-3 text-[0.8125rem] font-medium text-forest-accent hover:underline"
                >
                  Open
                </Link>
              </Card>
            );
          })}
        </div>
      )}

      {others.length > 0 && (
        <section className="mt-10 border-t border-sage-line pt-8">
          <h3 className="font-display text-xl leading-tight text-ink">Also in the Sanctuary</h3>
          <ul className="mt-4 flex flex-wrap gap-2">
            {others.map((resource) => (
              <li key={resource.id}>
                <Link
                  to={`/practitioner/sanctuary/${resource.id}`}
                  className="inline-flex min-h-[2.25rem] items-center rounded-full border border-sage-line bg-white px-3.5 text-[0.8125rem] text-ink-soft transition-colors hover:border-sage hover:text-ink"
                >
                  {resource.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
