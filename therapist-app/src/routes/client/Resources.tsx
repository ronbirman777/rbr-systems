import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { BookOpen, ClipboardList, Headphones, ListChecks, PlayCircle } from 'lucide-react';
import { useEcosystem } from '@/state/EcosystemProvider';
import { resourcesForClient } from '@/services/selectors';
import { Drawer } from '@/components/ui/Drawer';
import { AudioPlayer } from '@/components/client/AudioPlayer';
import { resourceTypeLabel } from '@/utils/format';
import type { ResourceType } from '@/types';

const typeIcon: Record<ResourceType, typeof Headphones> = {
  audio: Headphones,
  worksheet: ClipboardList,
  reading: BookOpen,
  video: PlayCircle,
  questionnaire: ListChecks,
};

export default function ClientResources() {
  const { clientId = 'emma' } = useParams();
  const { state, dispatch } = useEcosystem();
  const [openId, setOpenId] = useState<string | null>(null);

  const client = state.clients.find((c) => c.id === clientId) ?? state.clients[0];
  const resources = resourcesForClient(state, client.id);
  const open = resources.find((r) => r.id === openId);

  return (
    <div className="animate-fade-in">
      <header className="pb-6">
        <h1 className="editorial text-[2rem] leading-tight">Resources for you</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Chosen by {state.therapist.firstName} for the work you are doing together.
        </p>
      </header>

      <div className="space-y-3">
        {resources.map((resource) => {
          const Icon = typeIcon[resource.type];
          return (
            <button
              key={resource.id}
              type="button"
              onClick={() => {
                setOpenId(resource.id);
                dispatch({ type: 'resource/open', clientId: client.id, resourceId: resource.id });
              }}
              className="flex w-full items-start gap-4 rounded-xl2 border border-sage-200 bg-white px-4 py-4 text-left transition hover:border-forest-600/40"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cream text-forest-600">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[0.95rem] font-medium leading-snug text-ink">{resource.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-muted">{resource.summary}</p>
                <p className="mt-1.5 text-2xs uppercase tracking-widest2 text-ink-faint">
                  {resourceTypeLabel[resource.type]} · {resource.durationMin} min
                </p>
              </div>
            </button>
          );
        })}
      </div>

      <Drawer
        open={open !== undefined}
        onClose={() => setOpenId(null)}
        eyebrow={open ? `${resourceTypeLabel[open.type]} · ${open.durationMin} min` : ''}
        title={open?.title ?? ''}
        description={open?.summary}
      >
        {open && (
          <div className="space-y-6 pb-6">
            {open.type === 'audio' && <AudioPlayer title={open.title} durationMin={open.durationMin} />}
            <ol className="space-y-3">
              {open.preview.map((line, index) => (
                <li key={line} className="flex gap-3.5 text-[0.95rem] leading-relaxed text-ink">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cream text-2xs font-semibold text-forest-600">
                    {index + 1}
                  </span>
                  {line}
                </li>
              ))}
            </ol>
          </div>
        )}
      </Drawer>
    </div>
  );
}
