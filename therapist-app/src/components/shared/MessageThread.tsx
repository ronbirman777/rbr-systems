import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles } from 'lucide-react';
import { useApp } from '@/state/AppProvider';
import { messagesOf } from '@/services/selectors';
import { Monogram } from '@/components/ui/Monogram';
import { Button } from '@/components/ui/Button';
import { TextArea } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/Primitives';
import { clockTime, relativeDay, toISODate } from '@/utils/date';
import { cn } from '@/utils/cn';

/**
 * One conversation per relationship, shared by both experiences.
 *
 * Deliberately not a live chat — the tone is closer to letters between
 * sessions, and the composer says so.
 */
export function MessageThread({
  clientId,
  viewer,
  className,
}: {
  clientId: string;
  viewer: 'practitioner' | 'client';
  className?: string;
}) {
  const { state, dispatch } = useApp();
  const [body, setBody] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const client = state.clients.find((c) => c.id === clientId);
  const thread = messagesOf(state, clientId);

  useEffect(() => {
    dispatch({ type: 'message/mark-read', clientId, reader: viewer });
  }, [clientId, dispatch, viewer]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [thread.length]);

  if (!client) return null;

  const send = () => {
    if (!body.trim()) return;
    dispatch({ type: 'message/send', clientId, body: body.trim(), author: viewer });
    setBody('');
  };

  let lastDay = '';

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="flex-1 space-y-4 overflow-y-auto pb-4">
        {thread.length === 0 && (
          <EmptyState
            title="No messages yet"
            description={
              viewer === 'practitioner'
                ? `Anything you write to ${client.name} appears here.`
                : `Messages between you and ${state.practitioner.name} appear here.`
            }
          />
        )}

        {thread.map((message) => {
          const day = toISODate(message.sentAt ?? message.createdAt);
          const showDay = day !== lastDay;
          lastDay = day;
          const mine = message.author === viewer;
          const person = message.author === 'practitioner' ? state.practitioner : client;

          return (
            <div key={message.id}>
              {showDay && (
                <p className="my-5 text-center text-2xs uppercase tracking-eyebrow text-ink-faint">
                  {relativeDay(message.sentAt ?? message.createdAt)}
                </p>
              )}
              <div className={cn('flex items-end gap-2.5', mine && 'flex-row-reverse')}>
                <Monogram person={person} size="xs" className="mb-1" />
                <div className={cn('max-w-[85%] sm:max-w-[75%]', mine && 'text-right')}>
                  {message.kind === 'check-in' && (
                    <p
                      className={cn(
                        'mb-1 flex items-center gap-1 text-2xs font-medium uppercase tracking-eyebrow text-ink-faint',
                        mine && 'justify-end',
                      )}
                    >
                      <Sparkles className="h-3 w-3" aria-hidden="true" />
                      Check in
                    </p>
                  )}
                  <div
                    className={cn(
                      'rounded-[14px] px-4 py-3 text-left text-[0.9375rem] leading-relaxed',
                      mine
                        ? 'rounded-br-[4px] bg-forest text-cream'
                        : 'rounded-bl-[4px] border border-sage-line bg-white text-ink',
                    )}
                  >
                    {message.body}
                  </div>
                  <p className="mt-1 px-1 text-2xs text-ink-faint">
                    {clockTime(message.sentAt ?? message.createdAt)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-0 border-t border-sage-line bg-ivory/95 pt-4 backdrop-blur">
        <TextArea
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') send();
          }}
          placeholder={
            viewer === 'practitioner'
              ? `Write to ${client.name}. There is no rush on either side.`
              : `Write to ${state.practitioner.name}. He reads these between sessions.`
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
