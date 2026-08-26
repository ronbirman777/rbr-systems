import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useApp } from '@/state/AppProvider';
import { AudioPlayer } from '@/components/client/AudioPlayer';
import { BreathingGuide } from '@/components/client/BreathingGuide';
import { Eyebrow } from '@/components/ui/Primitives';
import { resourceFormatLabel } from '@/utils/format';

/** One resource, focused. Audio, a breathing pace, or something to read. */
export default function ClientResourcePlayer() {
  const { clientId = 'emma', resourceId = '' } = useParams();
  const { state, dispatch } = useApp();
  const [playing, setPlaying] = useState(false);

  const client = state.clients.find((c) => c.id === clientId) ?? state.clients[0];
  const base = `/client/${client.id}`;
  const resource = state.resources.find((r) => r.id === resourceId);

  useEffect(() => {
    if (resource) dispatch({ type: 'resource/open', clientId: client.id, resourceId: resource.id });
  }, [resource?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!resource) return <Navigate to={`${base}/resources`} replace />;

  return (
    <div className="animate-fade-in">
      <Link
        to={`${base}/resources/${resource.categoryId}`}
        className="inline-flex items-center gap-1.5 text-[0.8125rem] text-ink-soft hover:text-forest"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Back
      </Link>

      <Eyebrow className="mt-5">
        {resourceFormatLabel[resource.format]} · {resource.durationMin} min
      </Eyebrow>
      <h1 className="mt-1.5 font-display text-[1.75rem] leading-tight text-ink">{resource.title}</h1>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-soft">{resource.summary}</p>

      {resource.breathPattern && <BreathingGuide pattern={resource.breathPattern} running={playing} />}

      {resource.format === 'audio' && (
        <div className="mt-6">
          <AudioPlayer
            durationMin={resource.durationMin}
            title={resource.title}
            playing={playing}
            onPlayingChange={setPlaying}
          />
        </div>
      )}

      <ol className="mt-8 space-y-3.5">
        {resource.body.map((line, index) => (
          <li key={line} className="flex gap-3.5 text-[0.9375rem] leading-relaxed text-ink">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cream text-2xs font-semibold text-forest-accent">
              {index + 1}
            </span>
            {line}
          </li>
        ))}
      </ol>

      {resource.format === 'audio' && (
        <p className="mt-7 rounded-card border border-sage-line bg-cream/60 px-4 py-3 text-2xs leading-relaxed text-ink-soft">
          This prototype has no recording behind the player. The transport and the timing are real; the audio
          is not bundled.
        </p>
      )}
    </div>
  );
}
