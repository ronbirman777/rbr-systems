import { useEffect, useState } from 'react';
import { Send, Sparkles } from 'lucide-react';
import { Drawer } from '@/components/ui/Drawer';
import { Button } from '@/components/ui/Button';
import { TextArea } from '@/components/ui/Field';
import { Avatar } from '@/components/ui/Avatar';
import { useEcosystem } from '@/state/EcosystemProvider';
import { useToast } from '@/components/ui/Toast';
import { readingFor } from '@/services/selectors';
import { suggestCheckIn } from '@/services/checkIn';

/**
 * A suggested supportive check-in. The system drafts it; John decides.
 * Nothing is ever sent without this step.
 */
export function CheckInDrawer({
  clientId,
  open,
  onClose,
}: {
  clientId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const { state, dispatch } = useEcosystem();
  const toast = useToast();
  const client = state.clients.find((c) => c.id === clientId);
  const [body, setBody] = useState('');
  const [saved, setSaved] = useState(false);

  const reading = client ? readingFor(state, client.id) : null;
  const suggestion = client && reading ? suggestCheckIn(client, reading) : null;

  useEffect(() => {
    if (open && suggestion) {
      setBody(suggestion.body);
      setSaved(false);
    }
    // Re-seeding on every keystroke would fight the therapist's edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clientId]);

  if (!client || !suggestion) return null;

  const send = () => {
    dispatch({ type: 'message/send', clientId: client.id, body: body.trim(), author: 'therapist', kind: 'check-in' });
    toast(`Check-in sent to ${client.firstName}`);
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      eyebrow="Suggested"
      title={`Check in with ${client.firstName}`}
      description="Nothing is sent until you send it. Edit anything that does not sound like you."
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Dismiss
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setSaved(true);
                toast('Draft saved');
              }}
            >
              {saved ? 'Draft saved' : 'Save draft'}
            </Button>
          </div>
          <Button variant="primary" onClick={send} disabled={!body.trim()} icon={<Send className="h-4 w-4" />}>
            Send
          </Button>
        </div>
      }
    >
      <div className="space-y-6 pb-4">
        <div className="flex items-start gap-3 rounded-xl2 bg-cream px-4 py-4">
          <Avatar person={client} size="md" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">{client.firstName} {client.lastName}</p>
            <p className="mt-1 text-sm text-ink-muted">{reading?.headline}</p>
          </div>
        </div>

        <div>
          <p className="eyebrow mb-2 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Suggested wording
          </p>
          <TextArea rows={7} value={body} onChange={(e) => setBody(e.target.value)} aria-label="Check-in message" />
          <p className="mt-2 text-xs text-ink-faint">
            The suggestion names what was observed, never why. Interpretation stays with you.
          </p>
        </div>
      </div>
    </Drawer>
  );
}
