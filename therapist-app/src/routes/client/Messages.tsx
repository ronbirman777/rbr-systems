import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useApp } from '@/state/AppProvider';
import { MessageThread } from '@/components/shared/MessageThread';
import { Monogram } from '@/components/ui/Monogram';

export default function ClientMessages() {
  const { clientId = 'emma' } = useParams();
  const { state } = useApp();
  const client = state.clients.find((c) => c.id === clientId) ?? state.clients[0];
  const base = `/client/${client.id}`;

  return (
    <div className="animate-fade-in">
      <Link
        to={`${base}/today`}
        className="inline-flex min-h-[2.25rem] items-center gap-1.5 text-[0.8125rem] text-ink-soft transition-colors hover:text-forest"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Today
      </Link>

      <header className="mt-4 flex items-center gap-3.5 pb-5">
        <Monogram person={state.practitioner} size="lg" />
        <div>
          <h1 className="font-display text-2xl leading-tight text-ink">{state.practitioner.name}</h1>
          <p className="text-[0.8125rem] text-ink-soft">{state.practitioner.title}</p>
        </div>
      </header>

      <p className="mb-5 rounded-card bg-cream px-4 py-3.5 text-2xs leading-relaxed text-ink-soft">
        These messages are between sessions. {state.practitioner.name} is not waiting by the screen — write
        whenever it suits you, and expect a reply in his own time.
      </p>

      <MessageThread clientId={client.id} viewer="client" className="min-h-[50vh]" />
    </div>
  );
}
