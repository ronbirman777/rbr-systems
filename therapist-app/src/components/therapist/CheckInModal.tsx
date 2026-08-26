import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { Modal } from '@/components/ui/Overlay';
import { Button } from '@/components/ui/Button';
import { TextArea } from '@/components/ui/Field';
import { Monogram } from '@/components/ui/Monogram';
import { PrivateNote } from '@/components/shared/PrivateNote';
import { useApp } from '@/state/AppProvider';
import { useToast } from '@/components/ui/Toast';
import { draftCheckIn, readingFor } from '@/services/selectors';
import { suggestCheckIn } from '@/services/checkInSuggestion';

/**
 * Send a Gentle Check In.
 *
 * The system suggests wording; the practitioner reads it, edits it and sends
 * it. Nothing here can send on its own, and the private context that prompted
 * the suggestion never leaves this screen.
 */
export function CheckInModal({
  clientId,
  open,
  onClose,
}: {
  clientId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const { state, dispatch } = useApp();
  const toast = useToast();
  const [body, setBody] = useState('');

  const client = state.clients.find((c) => c.id === clientId);
  const reading = client ? readingFor(state, client.id) : null;
  const existingDraft = client ? draftCheckIn(state, client.id) : undefined;

  useEffect(() => {
    if (!open || !client || !reading) return;
    setBody(existingDraft?.body ?? suggestCheckIn(client, reading));
    // Re-seeding on every keystroke would fight the practitioner's edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clientId]);

  if (!client || !reading) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="Between sessions"
      title="Send a Gentle Check In"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              dispatch({ type: 'checkIn/save-draft', clientId: client.id, body });
              toast('Draft saved');
              onClose();
            }}
          >
            Save Draft
          </Button>
          <Button
            variant="primary"
            disabled={!body.trim()}
            icon={<Send className="h-4 w-4" />}
            onClick={() => {
              dispatch({ type: 'checkIn/send', clientId: client.id, body: body.trim() });
              toast(`Check in sent to ${client.name}`);
              onClose();
            }}
          >
            Send Check In Now
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Monogram person={client} size="md" />
          <div>
            <p className="eyebrow">Recipient</p>
            <p className="font-display text-lg leading-tight text-ink">{client.name}</p>
          </div>
        </div>

        <PrivateNote label="Private context">
          <p className="text-[0.8125rem] leading-relaxed text-ink">
            {client.name}’s recent rhythm has changed. {reading.recentRhythm}% recent completion against{' '}
            {reading.usualRhythm}% usual.
            {reading.insight ? ` ${reading.insight}` : ''}
          </p>
          <p className="mt-2 text-2xs leading-relaxed text-ink-faint">
            {client.name} never sees these figures. They exist so you can decide whether to reach out.
          </p>
        </PrivateNote>

        <div>
          <p className="eyebrow mb-1.5">Suggested message</p>
          <TextArea
            rows={6}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            aria-label="Check in message"
          />
          <p className="mt-2 text-2xs leading-relaxed text-ink-faint">
            Edit anything that does not sound like you. Nothing is sent until you send it.
          </p>
        </div>
      </div>
    </Modal>
  );
}
