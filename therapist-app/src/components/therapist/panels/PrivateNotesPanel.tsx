import { useState } from 'react';
import type { Client } from '@/types';
import { useApp } from '@/state/AppProvider';
import { sessionsOf, hasFinished, reflectionsOf } from '@/services/selectors';
import { PrivateNote } from '@/components/shared/PrivateNote';
import { TextArea } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Eyebrow, EmptyState } from '@/components/ui/Primitives';
import { fullDate, sessionWhen, timeAgo } from '@/utils/date';

/**
 * Practitioner-only. Nothing in `routes/client/**` imports this panel or the
 * fields it reads, so there is no route by which a client could reach it.
 */
export function PrivateNotesPanel({ client }: { client: Client }) {
  const { state, dispatch } = useApp();
  const held = sessionsOf(state, client.id)
    .filter((s) => hasFinished(s))
    .reverse();
  const thoughts = reflectionsOf(state, client.id).filter((r) => r.privateThought);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const valueFor = (id: string, fallback?: string) => drafts[id] ?? fallback ?? '';

  return (
    <div className="px-6 py-8 sm:px-10 lg:px-12">
      <h2 className="font-display text-[1.625rem] leading-tight text-ink">Private notes</h2>
      <p className="mt-1.5 max-w-xl text-[0.9375rem] text-ink-soft">
        Visible only to you. {client.name} has no route to this area anywhere in the companion app.
      </p>

      <Eyebrow className="mt-9 block">Session notes</Eyebrow>
      {held.length === 0 ? (
        <EmptyState title="No sessions held yet" />
      ) : (
        <ul className="mt-3 space-y-4">
          {held.map((session) => (
            <li key={session.id}>
              <PrivateNote label={`Session · ${sessionWhen(session.startsAt)}`}>
                <TextArea
                  rows={3}
                  value={valueFor(session.id, session.privateNotes)}
                  onChange={(e) => setDrafts((d) => ({ ...d, [session.id]: e.target.value }))}
                  placeholder="What is worth remembering from this session?"
                  aria-label={`Private note for the session on ${fullDate(session.startsAt.slice(0, 10))}`}
                  className="border-transparent bg-transparent px-0 py-0 text-[0.875rem] focus:ring-0"
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-2xs text-ink-faint">
                    {fullDate(session.startsAt.slice(0, 10))}
                  </span>
                  {drafts[session.id] !== undefined && drafts[session.id] !== session.privateNotes && (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => {
                        dispatch({
                          type: 'session/private-notes',
                          sessionId: session.id,
                          notes: drafts[session.id],
                        });
                        setDrafts((d) => {
                          const next = { ...d };
                          delete next[session.id];
                          return next;
                        });
                      }}
                    >
                      Save
                    </Button>
                  )}
                </div>
              </PrivateNote>
            </li>
          ))}
        </ul>
      )}

      {thoughts.length > 0 && (
        <>
          <Eyebrow className="mt-10 block">Thoughts on reflections</Eyebrow>
          <ul className="mt-3 space-y-3">
            {thoughts.map((reflection) => (
              <li key={reflection.id}>
                <PrivateNote label="Private therapist thought">
                  <p className="text-[0.875rem] leading-relaxed text-ink">{reflection.privateThought}</p>
                  <p className="mt-2 text-2xs text-ink-faint">
                    On “{reflection.title}” · {timeAgo(reflection.submittedAt)}
                  </p>
                </PrivateNote>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
