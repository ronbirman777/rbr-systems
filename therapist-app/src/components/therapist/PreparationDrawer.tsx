import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { Drawer } from '@/components/ui/Overlay';
import { Button } from '@/components/ui/Button';
import { ChoiceRow, Field, Select, TextArea, TextInput } from '@/components/ui/Field';
import { useApp } from '@/state/AppProvider';
import { useToast } from '@/components/ui/Toast';
import { preparationsFor } from '@/services/selectors';
import { Eyebrow } from '@/components/ui/Primitives';
import type { PreparationKind } from '@/types';
import { relativeDay } from '@/utils/date';

const KINDS: { value: PreparationKind; label: string }[] = [
  { value: 'reflection', label: 'Reflection' },
  { value: 'questionnaire', label: 'Questionnaire' },
  { value: 'journal', label: 'Journal' },
  { value: 'breathing', label: 'Breathing' },
  { value: 'worksheet', label: 'Worksheet' },
];

const DEFAULT_PROMPT: Record<PreparationKind, string> = {
  reflection: 'What has taken up the most space since we last spoke?',
  questionnaire: 'How have the last two weeks been, on the whole?',
  journal: 'Write a few lines about the week, whatever comes.',
  breathing: 'Four rounds of the breath before we meet, if there is time.',
  worksheet: 'Fill in what you can. Blank answers are useful too.',
};

/**
 * Attach something for the client to do before a session. This is what turns
 * booking into preparation rather than just a time in a diary.
 */
export function PreparationDrawer({
  open,
  onClose,
  sessionId,
}: {
  open: boolean;
  onClose: () => void;
  sessionId: string;
}) {
  const { state, dispatch } = useApp();
  const toast = useToast();

  const [kind, setKind] = useState<PreparationKind>('reflection');
  const [title, setTitle] = useState('Before we meet');
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT.reflection);
  const [resourceId, setResourceId] = useState('');

  const session = state.sessions.find((s) => s.id === sessionId);
  const existing = preparationsFor(state, sessionId);
  const client = state.clients.find((c) => c.id === session?.clientId);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      eyebrow="Session preparation"
      title={`Prepare ${client?.name ?? 'the client'}`}
      description={
        session ? `For the session ${relativeDay(session.startsAt).toLowerCase()}.` : undefined
      }
      footer={
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={onClose}>
            Done
          </Button>
          <Button
            variant="primary"
            disabled={!title.trim() || !prompt.trim()}
            icon={<Check className="h-4 w-4" />}
            onClick={() => {
              dispatch({
                type: 'preparation/attach',
                sessionId,
                kind,
                title: title.trim(),
                prompt: prompt.trim(),
                resourceId: resourceId || undefined,
              });
              toast(`${title.trim()} sent to ${client?.name}`);
              setTitle('Before we meet');
              setPrompt(DEFAULT_PROMPT[kind]);
            }}
          >
            Attach
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {existing.length > 0 && (
          <section>
            <Eyebrow className="mb-2">Already attached</Eyebrow>
            <ul className="space-y-2">
              {existing.map((preparation) => (
                <li
                  key={preparation.id}
                  className="flex items-center justify-between gap-3 rounded-card border border-sage-line bg-white px-3.5 py-2.5"
                >
                  <span className="min-w-0">
                    <span className="block text-[0.875rem] text-ink">{preparation.title}</span>
                    <span className="block text-2xs text-ink-faint">
                      {preparation.completedAt ? 'Completed' : 'Waiting on the client'}
                    </span>
                  </span>
                  {!preparation.completedAt && (
                    <button
                      type="button"
                      onClick={() =>
                        dispatch({ type: 'preparation/remove', preparationId: preparation.id })
                      }
                      aria-label={`Remove ${preparation.title}`}
                      className="tap-target shrink-0 rounded-control text-ink-faint transition-colors hover:bg-sage-wash hover:text-rose-deep"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <ChoiceRow<PreparationKind>
          label="Type"
          value={kind}
          onChange={(next) => {
            setKind(next);
            setPrompt(DEFAULT_PROMPT[next]);
          }}
          columns={3}
          options={KINDS}
        />

        <Field label="Title">
          {(id) => <TextInput id={id} value={title} onChange={(e) => setTitle(e.target.value)} />}
        </Field>

        <Field label="What you are asking" hint="Written to the client, in your own voice.">
          {(id) => (
            <TextArea id={id} rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          )}
        </Field>

        <Field label="Attach a resource" hint="Optional.">
          {(id) => (
            <Select id={id} value={resourceId} onChange={(e) => setResourceId(e.target.value)}>
              <option value="">No resource</option>
              {state.resources
                .filter((r) => r.status === 'active')
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
            </Select>
          )}
        </Field>
      </div>
    </Drawer>
  );
}
