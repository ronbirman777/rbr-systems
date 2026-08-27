import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useApp } from '@/state/AppProvider';
import { Card, EmptyState } from '@/components/ui/Primitives';
import { formatLabel } from '@/components/shared/resourceMeta';

export default function ClientResourceCategory() {
  const { clientId = 'emma', categoryId = '' } = useParams();
  const { state } = useApp();
  const client = state.clients.find((c) => c.id === clientId) ?? state.clients[0];
  const base = `/client/${client.id}`;

  const category = state.resourceCategories.find((c) => c.id === categoryId);
  if (!category) return <Navigate to={`${base}/resources`} replace />;

  const list = state.resources.filter((r) => r.categoryId === category.id);

  return (
    <div className="animate-fade-in">
      <Link
        to={`${base}/resources`}
        className="inline-flex items-center gap-1.5 text-[0.8125rem] text-ink-soft hover:text-forest"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Resources
      </Link>

      <h1 className="mt-5 font-display text-[1.875rem] leading-tight text-ink">{category.title}</h1>
      <p className="mt-1.5 text-[0.875rem] text-ink-soft">{category.blurb}</p>

      {list.length === 0 ? (
        <EmptyState title="Nothing here yet" />
      ) : (
        <ul className="mt-6 space-y-3">
          {list.map((resource) => (
            <li key={resource.id}>
              <Link to={`${base}/resource/${resource.id}`}>
                <Card className="p-4 transition-colors hover:border-sage">
                  <p className="text-3xs font-semibold uppercase tracking-eyebrow text-ink-faint">
                    {formatLabel[resource.format]} · {resource.durationMin} MIN
                  </p>
                  <div className="mt-1.5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-[1.0625rem] font-semibold leading-snug text-ink">{resource.title}</h2>
                      <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-soft">{resource.summary}</p>
                    </div>
                    <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-ink-faint" aria-hidden="true" />
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
