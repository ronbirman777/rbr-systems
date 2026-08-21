import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles } from 'lucide-react';
import { useEcosystem } from '@/state/EcosystemProvider';
import { threadFor } from '@/services/selectors';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { TextArea } from '@/components/ui/Field';
import { clockTime, relativeDay, toISODate } from '@/utils/date';
import { cn } from '@/utils/cn';

/**
 * One asynchronous thread per relationship. Deliberately not a live chat: the
 * tone is closer to letters between sessions than to instant messaging.
 */
export function MessageThread({
  clientId,
  viewer,
  className,
  autoMarkRead = true,
  placeholder,
}: {
  clientId: string;
  viewer: 'therapist' | 'client';
  className?: string;
  autoMarkRead?: boolean;
  placeholder?: string;
}) {
  const { state, dispatch } = useEcosystem();
  const [body, setBody] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const thread = threadFor(state, clientId);
  const client = state.clients.find((c) => c.id === clientId);

  useEffect(() => {
    if (autoMarkRead) dispatch({ type: 'thread/mark-read', clientId, reader: viewer });
  }, [autoMarkRead, clientId, dispatch, viewer]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [thread?.messages.length]);

  if (!thread || !client) return null;

  const send = () => {
    if (!body.trim()) return;
    dispatch({ type: 'message/send', clientId, body: body.trim(), author: viewer });
    setBody('');
  };

  let lastDay = '';

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="flex-1 space-y-4 overflow-y-auto pb-4">
        {thread.messages.map((message) => {
          const day = toISODate(message.sentAt);
          const showDay = day !== lastDay;
          lastDay = day;
          const mine = message.author === viewer;
          const person = message.author === 'therapist' ? state.therapist : client;

          return (
            <div key={message.id}>
              {showDay && (
                <p className="my-5 text-center text-2xs uppercase tracking-widest2 text-ink-faint">
                  {relativeDay(message.sentAt)}
                </p>
              )}
              <div className={cn('flex items-end gap-2.5', mine && 'flex-row-reverse')}>
                <Avatar person={person} size="xs" className="mb-1" />
                <div className={cn('max-w-[85%] sm:max-w-[75%]', mine && 'text-right')}>
                  {message.kind === 'check-in' && (
                    <p
                      className={cn(
                        'mb-1 flex items-center gap-1 text-2xs font-medium uppercase tracking-widest2 text-ink-faint',
                        mine && 'justify-end',
                      )}
                    >
                      <Sparkles className="h-3 w-3" aria-hidden="true" />
                      Check-in
                    </p>
                  )}
                  <div
                    className={cn(
                      'rounded-2xl px-4 py-3 text-left text-sm leading-relaxed',
                      mine
                        ? 'rounded-br-md bg-forest-900 text-cream'
                        : 'rounded-bl-md border border-sage-200 bg-white text-ink',
                    )}
                  >
                    {message.body}
                  </div>
                  <p className="mt-1 px-1 text-2xs text-ink-faint">{clockTime(message.sentAt)}</p>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-0 border-t border-sage-200/70 bg-ivory/95 pt-4 backdrop-blur">
        <TextArea
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') send();
          }}
          placeholder={
            placeholder ??
            (viewer === 'therapist'
              ? `Write to ${client.firstName}. There is no rush on either side.`
              : `Write to ${state.therapist.firstName}. He reads these between sessions.`)
          }
          aria-label="Message"
        />
        <div className="mt-2 flex items-center justify-between gap-3 pb-1">
          <p className="text-2xs text-ink-faint">Messages are not monitored in real time.</p>
          <Button variant="primary" size="sm" onClick={send} disabled={!body.trim()} icon={<Send className="h-4 w-4" />}>
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
