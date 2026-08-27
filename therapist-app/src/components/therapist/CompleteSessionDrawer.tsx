import { useState } from 'react';
import { Check } from 'lucide-react';
import { Drawer } from '@/components/ui/Overlay';
import { Button } from '@/components/ui/Button';
import { TextArea } from '@/components/ui/Field';
import { PrivateNote } from '@/components/shared/PrivateNote';
import { Eyebrow } from '@/components/ui/Primitives';
import { useApp } from '@/state/AppProvider';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/utils/cn';
import { hasFinished } from '@/services/selectors';

type Next = 'practice' | 'resource' | 'session' | 'message';

/**
 * After a session. Deliberately lightweight — nothing here is required, and the
 * follow-ups hand off to the flows that already exist rather than duplicating
 * them.
 */
export function CompleteSessionDrawer({
  open,
  onClose,
  sessionId,
  onFollowUp,
}: {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  onFollowUp: (next: Next) => void;
}) {
  const { state, dispatch } = useApp();
  const toast = useToast();

  const session = state.sessions.find((s) => s.id === sessionId);
  const client = state.clients.find((c) => c.id === session?.clientId);
  const [note, setNote] = useState(session?.privateNotes ?? '');

  if (!session || !client) return null;

  const followUps: { key: Next; label: string; detail: string }[] = [
    { key: 'practice', label: 'Assign a practice', detail: 'Something to carry into the week' },
    { key: 'resource', label: 'Share a resource', detail: 'From the Sanctuary' },
    { key: 'session', label: 'Schedule the next session', detail: 'While it is still in mind' },
    { key: 'message', label: 'Send a message', detail: 'A line between now and then' },
  ];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      eyebrow="After the session"
      title={`Complete session with ${client.name}`}
      description={
        hasFinished(session)
          ? 'Take what is useful and leave the rest — none of this is required.'
          : `This hour has not happened yet. Closing it out now is fine — nothing here is required.`
      }
      footer={
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={onClose}>
            Not yet
          </Button>
          <Button
            variant="primary"
            icon={<Check className="h-4 w-4" />}
            onClick={() => {
              if (note.trim() !== (session.privateNotes ?? '')) {
                dispatch({ type: 'session/private-notes', sessionId, notes: note });
              }
              dispatch({ type: 'session/complete', sessionId });
              toast(`Session with ${client.name} completed`);
              onClose();
            }}
          >
            Complete Session
          </Button>
        </div>
      }
    >
      <div className="space-y-7">
        <PrivateNote label="Private session note">
          <TextArea
            rows={6}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What is worth remembering from this hour?"
            aria-label="Private session note"
            className="border-transparent bg-transparent px-0 py-0 text-[0.875rem] focus:ring-0"
          />
        </PrivateNote>

        <section>
          <Eyebrow className="mb-3">Follow up</Eyebrow>
          <ul className="space-y-2">
            {followUps.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => onFollowUp(item.key)}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-card border border-sage-line',
                    'bg-white px-4 py-3.5 text-left transition-colors hover:border-sage',
                  )}
                >
                  <span className="min-w-0">
                    <span className="block text-[0.9375rem] font-medium text-ink">{item.label}</span>
                    <span className="block text-[0.8125rem] text-ink-soft">{item.detail}</span>
                  </span>
                  <span aria-hidden="true" className="text-ink-faint">
                    →
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-2xs leading-relaxed text-ink-faint">
            Anything you set up here appears in {client.name}’s companion straight away.
          </p>
        </section>
      </div>
    </Drawer>
  );
}
