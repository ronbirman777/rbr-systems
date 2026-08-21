import { useParams } from 'react-router-dom';
import { useEcosystem } from '@/state/EcosystemProvider';
import { chaptersForClient, sessionsFor } from '@/services/selectors';
import { JourneyTimeline } from '@/components/client/JourneyTimeline';
import { plural } from '@/utils/format';

export default function ClientJourney() {
  const { clientId = 'emma' } = useParams();
  const { state } = useEcosystem();
  const client = state.clients.find((c) => c.id === clientId) ?? state.clients[0];
  const chapters = chaptersForClient(state, client.id);
  const current = chapters.find((c) => c.current);
  const sessionsHeld = sessionsFor(state, client.id).filter((s) => s.status === 'completed').length;

  return (
    <div className="animate-fade-in">
      <header className="pb-8">
        <p className="eyebrow mb-2">Your journey</p>
        <h1 className="editorial text-[2rem] leading-tight">
          {plural(client.weeksTogether, 'week')} of work
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          Not a score and not a level. This is the story of what you and {state.therapist.firstName} have
          been working on, chapter by chapter.
        </p>
        <dl className="mt-6 grid grid-cols-3 gap-3">
          {[
            { label: 'Weeks', value: client.weeksTogether },
            { label: 'Sessions', value: sessionsHeld },
            { label: 'Chapters', value: chapters.length },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl2 bg-cream px-4 py-4 text-center">
              <dd className="editorial text-2xl text-forest-900">{stat.value}</dd>
              <dt className="mt-0.5 text-2xs uppercase tracking-widest2 text-ink-faint">{stat.label}</dt>
            </div>
          ))}
        </dl>
      </header>

      {current && (
        <section className="mb-9 rounded-4xl bg-forest-900 px-6 py-6 text-cream">
          <p className="text-2xs uppercase tracking-widest2 text-sage-400">Current focus</p>
          <p className="editorial mt-1.5 text-xl leading-snug">{client.focusDetail}</p>
        </section>
      )}

      <JourneyTimeline chapters={chapters} compact />
    </div>
  );
}
