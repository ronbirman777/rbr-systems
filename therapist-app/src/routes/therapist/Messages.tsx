import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, MessageCirclePlus } from 'lucide-react';
import { useEcosystem } from '@/state/EcosystemProvider';
import { threadFor, unreadForTherapist } from '@/services/selectors';
import { PageHeader } from '@/components/ui/PageHeader';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { MessageThread } from '@/components/messages/MessageThread';
import { CheckInDrawer } from '@/components/messages/CheckInDrawer';
import { timeAgo } from '@/utils/date';
import { cn } from '@/utils/cn';

export default function TherapistMessages() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const { state } = useEcosystem();
  const [checkInOpen, setCheckInOpen] = useState(false);

  const conversations = useMemo(
    () =>
      state.clients
        .map((client) => {
          const thread = threadFor(state, client.id);
          const last = thread?.messages[thread.messages.length - 1];
          return { client, last, unread: unreadForTherapist(state, client.id) };
        })
        .sort((a, b) => {
          if (a.unread !== b.unread) return b.unread - a.unread;
          return new Date(b.last?.sentAt ?? 0).getTime() - new Date(a.last?.sentAt ?? 0).getTime();
        }),
    [state],
  );

  const selectedId = clientId ?? conversations[0]?.client.id;
  const selected = state.clients.find((c) => c.id === selectedId);

  useEffect(() => {
    if (!clientId && selectedId) navigate(`/therapist/messages/${selectedId}`, { replace: true });
  }, [clientId, selectedId, navigate]);

  return (
    <div className="animate-fade-in">
      <PageHeader
        eyebrow="Messages"
        title="Between the sessions"
        lede="Asynchronous by design. Nobody is expected to be waiting at the other end."
      />

      <div className="grid gap-6 lg:grid-cols-[20rem,1fr]">
        {/* Conversation list */}
        <div className={cn('min-w-0', clientId && 'hidden lg:block')}>
          <ul className="hairline-list overflow-hidden rounded-xl2 border border-sage-200 bg-white">
            {conversations.map(({ client, last, unread }) => (
              <li key={client.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/therapist/messages/${client.id}`)}
                  className={cn(
                    'flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors',
                    selectedId === client.id ? 'bg-cream' : 'hover:bg-cream/60',
                  )}
                >
                  <Avatar person={client} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-ink">{client.firstName} {client.lastName}</p>
                      {last && <span className="shrink-0 text-2xs text-ink-faint">{timeAgo(last.sentAt)}</span>}
                    </div>
                    <p className={cn('mt-0.5 truncate text-xs', unread > 0 ? 'font-medium text-ink' : 'text-ink-muted')}>
                      {last ? `${last.author === 'therapist' ? 'You: ' : ''}${last.body}` : 'No messages yet'}
                    </p>
                  </div>
                  {unread > 0 && (
                    <span className="mt-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-forest-900 px-1.5 text-2xs font-semibold text-cream">
                      {unread}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Thread */}
        {selected && (
          <div className={cn('min-w-0', !clientId && 'hidden lg:block')}>
            <div className="flex flex-col rounded-xl2 border border-sage-200 bg-ivory">
              <header className="flex items-center justify-between gap-3 border-b border-sage-200/70 px-5 py-3.5">
                <div className="flex min-w-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={() => navigate('/therapist/messages')}
                    className="-ml-2 rounded-full p-2 text-ink-muted lg:hidden"
                    aria-label="Back to conversations"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <Avatar person={selected} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">
                      {selected.firstName} {selected.lastName}
                    </p>
                    <p className="truncate text-2xs text-ink-faint">{selected.focus}</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setCheckInOpen(true)}
                  icon={<MessageCirclePlus className="h-4 w-4" />}
                >
                  <span className="hidden sm:inline">Suggested check-in</span>
                  <span className="sm:hidden">Check-in</span>
                </Button>
              </header>
              <div className="px-5 pb-4">
                <MessageThread clientId={selected.id} viewer="therapist" className="h-[30rem] lg:h-[34rem]" />
              </div>
            </div>
          </div>
        )}
      </div>

      <CheckInDrawer clientId={selectedId ?? null} open={checkInOpen} onClose={() => setCheckInOpen(false)} />
    </div>
  );
}
