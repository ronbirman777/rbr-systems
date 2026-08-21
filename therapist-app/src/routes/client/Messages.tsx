import { useParams } from 'react-router-dom';
import { useEcosystem } from '@/state/EcosystemProvider';
import { MessageThread } from '@/components/messages/MessageThread';
import { Avatar } from '@/components/ui/Avatar';

export default function ClientMessages() {
  const { clientId = 'emma' } = useParams();
  const { state } = useEcosystem();
  const client = state.clients.find((c) => c.id === clientId) ?? state.clients[0];

  return (
    <div className="animate-fade-in">
      <header className="flex items-center gap-3.5 pb-6">
        <Avatar person={state.therapist} size="lg" />
        <div>
          <h1 className="editorial text-2xl leading-tight">
            {state.therapist.firstName} {state.therapist.lastName}
          </h1>
          <p className="text-sm text-ink-muted">{state.therapist.title}</p>
        </div>
      </header>

      <p className="mb-5 rounded-xl2 bg-cream px-4 py-3.5 text-xs leading-relaxed text-ink-muted">
        These messages are between sessions. {state.therapist.firstName} is not waiting by the screen —
        write whenever it suits you, and expect a reply in his own time.
      </p>

      <MessageThread clientId={client.id} viewer="client" className="min-h-[50vh]" />
    </div>
  );
}
