import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Drawer } from '@/components/ui/Overlay';
import { Button } from '@/components/ui/Button';
import { Field, Select, TextArea, TextInput } from '@/components/ui/Field';
import { Monogram } from '@/components/ui/Monogram';
import { useApp } from '@/state/AppProvider';
import { useToast } from '@/components/ui/Toast';
import { plural } from '@/utils/format';
import type { RecurrenceRule } from '@/types';
import { cn } from '@/utils/cn';

const REPEATS: { value: RecurrenceRule; label: string }[] = [
  { value: 'none', label: 'Once' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly' },
];

/** Share one resource with one client, or with several at once. */
export function AssignResourceDrawer({
  open,
  onClose,
  resourceId,
  presetClientIds = [],
}: {
  open: boolean;
  onClose: () => void;
  resourceId?: string;
  presetClientIds?: string[];
}) {
  const { state, dispatch } = useApp();
  const toast = useToast();

  const [clientIds, setClientIds] = useState<string[]>(presetClientIds);
  const [selectedResource, setSelectedResource] = useState(resourceId ?? '');
  const [message, setMessage] = useState('');
  const [startDate, setStartDate] = useState('');
  const [suggestedTime, setSuggestedTime] = useState('');
  const [repeat, setRepeat] = useState<RecurrenceRule>('none');

  useEffect(() => {
    if (!open) return;
    setClientIds(presetClientIds);
    setSelectedResource(resourceId ?? state.resources[0]?.id ?? '');
    setMessage('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resourceId]);

  const resource = state.resources.find((r) => r.id === selectedResource);
  const already = new Set(
    state.resourceAssignments.filter((a) => a.resourceId === selectedResource).map((a) => a.clientId),
  );

  const toggle = (id: string) =>
    setClientIds((current) => (current.includes(id) ? current.filter((c) => c !== id) : [...current, id]));

  const submit = () => {
    if (!selectedResource || clientIds.length === 0) return;
    dispatch({
      type: 'resource/assign',
      draft: {
        resourceId: selectedResource,
        clientIds,
        message: message.trim() || undefined,
        startDate: startDate || undefined,
        suggestedTime: suggestedTime || undefined,
        repeat,
      },
    });
    toast(
      clientIds.length === 1
        ? `${resource?.title} shared with ${state.clients.find((c) => c.id === clientIds[0])?.name}`
        : `${resource?.title} shared with ${plural(clientIds.length, 'client')}`,
    );
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      eyebrow="Sanctuary"
      title="Assign to a client"
      description="It appears in their Resources straight away."
      footer={
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            disabled={clientIds.length === 0}
            icon={<Check className="h-4 w-4" />}
          >
            {clientIds.length <= 1 ? 'Assign' : `Assign to ${clientIds.length}`}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <Field label="Resource">
          {(id) => (
            <Select
              id={id}
              value={selectedResource}
              onChange={(e) => setSelectedResource(e.target.value)}
            >
              {state.resources
                .filter((r) => r.status === 'active')
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title} · {r.durationMin} min
                  </option>
                ))}
            </Select>
          )}
        </Field>

        <fieldset>
          <legend className="eyebrow mb-2">Who is this for</legend>
          <div className="flex flex-wrap gap-2">
            {state.clients.map((client) => {
              const active = clientIds.includes(client.id);
              const has = already.has(client.id);
              return (
                <button
                  key={client.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggle(client.id)}
                  className={cn(
                    'flex min-h-[2.5rem] items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-[0.8125rem] transition-colors',
                    active
                      ? 'border-forest bg-forest text-cream'
                      : 'border-sage-line bg-white text-ink hover:border-sage',
                  )}
                >
                  <Monogram person={client} size="xs" />
                  {client.name}
                  {has && !active && <span className="text-2xs text-ink-faint">· has it</span>}
                  {active && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-2xs text-ink-faint">
            Clients who already have this resource are marked; assigning again changes nothing.
          </p>
        </fieldset>

        <Field label="Message from you" hint="Optional. Shown with the resource in their app.">
          {(id) => (
            <TextArea
              id={id}
              rows={2}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Try this in the hour after work rather than at bedtime."
            />
          )}
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Start date">
            {(id) => (
              <TextInput id={id} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            )}
          </Field>
          <Field label="Suggested time">
            {(id) => (
              <TextInput
                id={id}
                type="time"
                value={suggestedTime}
                onChange={(e) => setSuggestedTime(e.target.value)}
              />
            )}
          </Field>
        </div>

        <Field label="Repeat">
          {(id) => (
            <Select id={id} value={repeat} onChange={(e) => setRepeat(e.target.value as RecurrenceRule)}>
              {REPEATS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
    </Drawer>
  );
}
