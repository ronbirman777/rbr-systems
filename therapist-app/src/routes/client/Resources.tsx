import { Link, useParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useApp } from '@/state/AppProvider';
import { resourcesFor } from '@/services/selectors';
import { Card, Eyebrow, IconTile } from '@/components/ui/Primitives';
import { categoryIcon, formatLabel } from '@/components/shared/resourceMeta';

/**
 * The two-column category grid from the reference, with the space beneath it
 * carrying what has actually been shared rather than decoration.
 */
export default function ClientResources() {
  const { clientId = 'emma' } = useParams();
  const { state } = useApp();
  const client = state.clients.find((c) => c.id === clientId) ?? state.clients[0];
  const base = `/client/${client.id}`;

  const assigned = resourcesFor(state, client.id);
  const opened = state.events
    .filter((e) => e.clientId === client.id && e.kind === 'resource-opened')
    .slice(0, 2)
    .map((e) => state.resources.find((r) => e.label.endsWith(r.title)))
    .filter(Boolean);

  return (
    <div className="animate-fade-in">
      <h1 className="font-display text-[1.875rem] leading-tight text-ink">Resources</h1>

      <div className="mt-6 grid grid-cols-2 gap-3">
        {state.resourceCategories.map((category) => {
          const Icon = categoryIcon[category.id];
          return (
            <Link
              key={category.id}
              to={`${base}/resources/${category.id}`}
              className="group flex min-h-[8.5rem] flex-col rounded-card border border-sage-line bg-white p-4 transition-colors hover:border-sage"
            >
              <IconTile size="sm">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </IconTile>
              <h2 className="mt-3.5 text-[0.9375rem] font-semibold leading-snug text-ink">{category.title}</h2>
              <p className="mt-0.5 text-[0.75rem] leading-relaxed text-ink-soft">{category.blurb}</p>
              <ArrowRight
                className="mt-auto h-4 w-4 text-ink-faint transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          );
        })}
      </div>

      <p className="mt-5 text-center text-[0.8125rem] text-ink-faint">
        Shared by {state.practitioner.name}
      </p>

      {assigned.length > 0 && (
        <section className="mt-9 border-t border-sage-line pt-7">
          <Eyebrow>Assigned to you</Eyebrow>
          <ul className="mt-3 space-y-2.5">
            {assigned.slice(0, 4).map((resource) => (
              <li key={resource.id}>
                <Link to={`${base}/resource/${resource.id}`}>
                  <Card className="flex items-center justify-between gap-3 p-3.5 transition-colors hover:border-sage">
                    <span className="min-w-0">
                      <span className="block text-[0.875rem] font-medium leading-snug text-ink">
                        {resource.title}
                      </span>
                      <span className="mt-0.5 block text-[0.75rem] text-ink-soft">
                        {formatLabel[resource.format]} · {resource.durationMin} min
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden="true" />
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {opened.length > 0 && (
        <section className="mt-8">
          <Eyebrow>Continue</Eyebrow>
          <ul className="mt-3 flex flex-wrap gap-2">
            {opened.map(
              (resource) =>
                resource && (
                  <li key={resource.id}>
                    <Link
                      to={`${base}/resource/${resource.id}`}
                      className="inline-flex min-h-[2.25rem] items-center rounded-full border border-sage-line bg-white px-3.5 text-[0.8125rem] text-ink-soft transition-colors hover:border-sage hover:text-ink"
                    >
                      {resource.title}
                    </Link>
                  </li>
                ),
            )}
          </ul>
        </section>
      )}
    </div>
  );
}
