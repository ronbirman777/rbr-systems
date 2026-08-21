import { useState } from 'react';
import { BookOpen, ClipboardList, Headphones, ListChecks, PlayCircle, Plus } from 'lucide-react';
import type { Resource, ResourceType } from '@/types';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Avatar } from '@/components/ui/Avatar';
import { useEcosystem } from '@/state/EcosystemProvider';
import { resourceTypeLabel } from '@/utils/format';
import { EmptyState } from '@/components/ui/EmptyState';

const typeIcon: Record<ResourceType, typeof Headphones> = {
  audio: Headphones,
  worksheet: ClipboardList,
  reading: BookOpen,
  video: PlayCircle,
  questionnaire: ListChecks,
};

/**
 * A curated library rather than a file manager: each item reads like something
 * chosen, with a preview you can actually judge it by.
 */
export function ResourceGrid({
  resources,
  onAssign,
}: {
  resources: Resource[];
  onAssign?: (resourceId: string) => void;
}) {
  const { state } = useEcosystem();
  const [previewId, setPreviewId] = useState<string | null>(null);
  const preview = resources.find((r) => r.id === previewId);

  if (resources.length === 0) {
    return <EmptyState title="Nothing here yet" description="Resources assigned to this client will appear here." />;
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {resources.map((resource) => {
          const Icon = typeIcon[resource.type];
          const using = state.clients.filter((c) => resource.clientsUsing.includes(c.id));
          return (
            <article
              key={resource.id}
              className="flex flex-col rounded-xl2 border border-sage-200 bg-white p-5 transition hover:shadow-soft"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-cream text-forest-600">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="text-2xs uppercase tracking-widest2 text-ink-faint">
                  {resourceTypeLabel[resource.type]} · {resource.durationMin} min
                </span>
              </div>

              <h3 className="editorial mt-4 text-xl leading-tight">{resource.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-muted">{resource.summary}</p>

              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-2">
                    {using.slice(0, 3).map((client) => (
                      <Avatar key={client.id} person={client} size="xs" ring />
                    ))}
                  </div>
                  <span className="text-2xs text-ink-faint">
                    {using.length === 0 ? 'Not assigned' : `${using.length} using`}
                  </span>
                </div>
                <span className="rounded-full bg-sage-100 px-2.5 py-1 text-2xs text-forest-700">
                  {resource.category}
                </span>
              </div>

              <div className="mt-4 flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setPreviewId(resource.id)}>
                  Preview
                </Button>
                {onAssign && (
                  <Button size="sm" variant="ghost" onClick={() => onAssign(resource.id)} icon={<Plus className="h-4 w-4" />}>
                    Assign
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <Drawer
        open={preview !== undefined}
        onClose={() => setPreviewId(null)}
        eyebrow={preview ? `${resourceTypeLabel[preview.type]} · ${preview.durationMin} min` : ''}
        title={preview?.title ?? ''}
        description={preview?.summary}
        footer={
          onAssign && preview ? (
            <div className="flex justify-end">
              <Button
                variant="primary"
                onClick={() => {
                  onAssign(preview.id);
                  setPreviewId(null);
                }}
                icon={<Plus className="h-4 w-4" />}
              >
                Assign this resource
              </Button>
            </div>
          ) : undefined
        }
      >
        {preview && (
          <div className="space-y-6 pb-4">
            <ol className="space-y-3">
              {preview.preview.map((line, index) => (
                <li key={line} className="flex gap-3.5 text-[0.95rem] leading-relaxed text-ink">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cream text-2xs font-semibold text-forest-600">
                    {index + 1}
                  </span>
                  {line}
                </li>
              ))}
            </ol>
            <p className="rounded-xl bg-sage-100/70 px-4 py-3 text-xs text-ink-muted">
              This is a preview of the written guidance. In the client app the full resource is available,
              including audio where applicable.
            </p>
          </div>
        )}
      </Drawer>
    </>
  );
}
