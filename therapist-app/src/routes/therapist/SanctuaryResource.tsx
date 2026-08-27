import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ChevronRight, Plus } from 'lucide-react';
import { useApp } from '@/state/AppProvider';
import { clientsUsing } from '@/services/selectors';
import { AssignResourceDrawer } from '@/components/therapist/AssignResourceDrawer';
import { ResourceFormDrawer } from '@/components/therapist/ResourceFormDrawer';
import { AudioPlayer } from '@/components/client/AudioPlayer';
import { BreathingGuide } from '@/components/client/BreathingGuide';
import { Button } from '@/components/ui/Button';
import { Monogram } from '@/components/ui/Monogram';
import { Eyebrow } from '@/components/ui/Primitives';
import { formatLabel, hasTransport, isPlayable } from '@/components/shared/resourceMeta';
import { shortDate } from '@/utils/date';

/** The resource as the client will meet it, plus who already has it. */
export default function SanctuaryResource() {
  const { resourceId = '' } = useParams();
  const { state } = useApp();
  const [assignOpen, setAssignOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [playing, setPlaying] = useState(false);

  const resource = state.resources.find((r) => r.id === resourceId);
  if (!resource) return <Navigate to="/practitioner/sanctuary" replace />;

  const category = state.resourceCategories.find((c) => c.id === resource.categoryId);
  const using = clientsUsing(state, resource.id);

  return (
    <div className="animate-fade-in">
      <div className="border-b border-sage-line px-6 pb-7 pt-7 sm:px-10 lg:px-12">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[0.8125rem] text-ink-soft">
          <Link to="/practitioner/sanctuary" className="hover:text-forest hover:underline">
            Sanctuary
          </Link>
          <ChevronRight className="h-3.5 w-3.5 text-ink-faint" aria-hidden="true" />
          <span className="text-ink">{category?.title}</span>
        </nav>

        <header className="mt-5 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div className="min-w-0 max-w-2xl">
            <Eyebrow>
              {formatLabel[resource.format]} · {resource.durationMin} min · added{' '}
              {shortDate(resource.addedOn)}
            </Eyebrow>
            <h1 className="mt-2 font-display text-[2rem] leading-tight text-ink">{resource.title}</h1>
            <p className="mt-2 text-[0.9375rem] text-ink-soft">{resource.summary}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="sm" onClick={() => setAssignOpen(true)} icon={<Plus className="h-4 w-4" />}>
              Assign to a client
            </Button>
            <Button size="sm" onClick={() => setEditOpen(true)}>
              Edit
            </Button>
          </div>
        </header>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0 px-6 py-8 sm:px-10 lg:px-12">
          {resource.breathPattern && (
            <div className="rounded-card border border-sage-line bg-white">
              <BreathingGuide pattern={resource.breathPattern} running={playing} />
            </div>
          )}

          {hasTransport(resource.format) && (
            <div className="mt-6 max-w-lg">
              <AudioPlayer
                durationMin={resource.durationMin}
                title={resource.title}
                playing={playing}
                onPlayingChange={setPlaying}
              />
              {isPlayable(resource.format) && (
                <p className="mt-4 rounded-card border border-sage-line bg-cream/60 px-4 py-3 text-2xs leading-relaxed text-ink-soft">
                  This prototype has no recording behind the player. The transport and timing are real; no
                  audio file is bundled.
                </p>
              )}
            </div>
          )}

          <section className="mt-8 max-w-2xl">
            <Eyebrow className="mb-3">What the client sees</Eyebrow>
            <ol className="space-y-3.5">
              {resource.body.map((line, index) => (
                <li key={line} className="flex gap-3.5 text-[0.9375rem] leading-relaxed text-ink">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cream text-2xs font-semibold text-forest-accent">
                    {index + 1}
                  </span>
                  {line}
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="border-t border-sage-line px-6 py-8 sm:px-10 lg:border-l lg:border-t-0 lg:px-7">
          <Eyebrow className="mb-3">Clients using this</Eyebrow>
          {using.length === 0 ? (
            <p className="text-[0.875rem] text-ink-soft">Not assigned to anyone yet.</p>
          ) : (
            <ul className="hairlines">
              {using.map((client) => (
                <li key={client.id}>
                  <Link
                    to={`/practitioner/clients/${client.id}`}
                    className="flex items-center gap-3 py-3 transition-colors hover:bg-cream/50"
                  >
                    <Monogram person={client} size="sm" />
                    <span className="min-w-0">
                      <span className="block text-[0.9375rem] text-ink">{client.name}</span>
                      <span className="block text-2xs text-ink-soft">{client.focus}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      <AssignResourceDrawer open={assignOpen} onClose={() => setAssignOpen(false)} resourceId={resource.id} />
      <ResourceFormDrawer open={editOpen} onClose={() => setEditOpen(false)} resource={resource} />
    </div>
  );
}
