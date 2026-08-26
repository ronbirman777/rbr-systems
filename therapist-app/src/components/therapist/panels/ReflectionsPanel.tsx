import { useEffect, useState } from 'react';
import type { Client } from '@/types';
import { useApp } from '@/state/AppProvider';
import { reflectionsOf } from '@/services/selectors';
import { PrivateNote } from '@/components/shared/PrivateNote';
import { TextArea } from '@/components/ui/Field';
import { EmptyState, Eyebrow } from '@/components/ui/Primitives';
import { fullDate, timeAgo } from '@/utils/date';
import { cn } from '@/utils/cn';

/** Master–detail: the reflections a client has written, and the one selected. */
export function ReflectionsPanel({ client }: { client: Client }) {
  const { state, dispatch } = useApp();
  const list = reflectionsOf(state, client.id);
  const [selectedId, setSelectedId] = useState(list[0]?.id ?? '');
  const selected = list.find((r) => r.id === selectedId) ?? list[0];
  const [thought, setThought] = useState(selected?.privateThought ?? '');

  useEffect(() => {
    setThought(selected?.privateThought ?? '');
    if (selected && !selected.readByPractitioner) {
      dispatch({ type: 'reflection/mark-read', reflectionId: selected.id });
    }
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (list.length === 0) {
    return (
      <div className="px-6 py-8 sm:px-10 lg:px-12">
        <EmptyState
          title="No reflections yet"
          description={`Anything ${client.name} writes and submits will appear here.`}
        />
      </div>
    );
  }

  return (
    <div className="lg:grid lg:grid-cols-[19rem_minmax(0,1fr)]">
      <div className="border-b border-sage-line px-6 py-8 sm:px-10 lg:border-b-0 lg:border-r lg:px-7">
        <Eyebrow className="mb-3">Reflections</Eyebrow>
        <ul className="hairlines">
          {list.map((reflection) => {
            const active = reflection.id === selected?.id;
            return (
              <li key={reflection.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(reflection.id)}
                  className={cn(
                    'w-full py-3.5 pr-2 text-left transition-colors',
                    active ? 'text-ink' : 'text-ink-soft hover:text-ink',
                  )}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className={cn('text-[0.875rem]', active && 'font-medium')}>{reflection.title}</span>
                    {!reflection.readByPractitioner && (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber" aria-label="Unread" />
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-2xs text-ink-faint">
                    {timeAgo(reflection.submittedAt)} · {reflection.body.slice(0, 40)}…
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {selected && (
        <article className="min-w-0 px-6 py-8 sm:px-10 lg:px-10">
          <Eyebrow>
            {selected.source === 'pre-session' ? 'Session preparation' : 'Written practice'} ·{' '}
            {fullDate(selected.submittedAt.slice(0, 10))}
          </Eyebrow>
          <h2 className="mt-2 font-display text-[1.625rem] leading-tight text-ink">{selected.title}</h2>

          <blockquote className="mt-6 border-l-2 border-sage pl-5">
            <p className="whitespace-pre-line font-display text-[1.1875rem] italic leading-relaxed text-ink">
              {selected.body}
            </p>
          </blockquote>
          <p className="mt-3 text-2xs text-ink-faint">Submitted {timeAgo(selected.submittedAt)}</p>

          <PrivateNote label="Private therapist thought" className="mt-8 max-w-xl">
            <TextArea
              rows={4}
              value={thought}
              onChange={(e) => setThought(e.target.value)}
              onBlur={() =>
                dispatch({ type: 'reflection/private-thought', reflectionId: selected.id, thought })
              }
              placeholder="A thought only you will see..."
              aria-label="Private therapist thought"
              className="border-transparent bg-transparent px-0 py-0 text-[0.875rem] focus:ring-0"
            />
          </PrivateNote>
        </article>
      )}
    </div>
  );
}
